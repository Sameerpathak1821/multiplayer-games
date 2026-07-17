import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { RoomEvent, RoomSnapshot } from "@gamehub/shared";
import { isValidRoomCode } from "@gamehub/shared";
import { ensureGuestSession, getToken } from "../lib/session";
import { RoomConnection, type ClosedReason, type ConnectionStatus } from "../lib/room";

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  left: "You left the room.",
  kicked: "You were removed from the room by the host.",
  room_full: "That room is full.",
  room_not_found: "That room doesn't exist (or has ended).",
  error: "Lost connection to the room.",
};

function eventLine(e: RoomEvent): string | null {
  switch (e.kind) {
    case "joined":
      return `${e.name} joined`;
    case "left":
      return `${e.name} left`;
    case "kicked":
      return `${e.name} was removed by the host`;
    case "disconnected":
      return `${e.name} lost connection…`;
    case "reconnected":
      return `${e.name} is back`;
    case "owner_changed":
      return `${e.name} is now the host`;
  }
}

export default function Lobby() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const roomCode = code.toUpperCase();

  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [closed, setClosed] = useState<ClosedReason | null>(null);
  const [feed, setFeed] = useState<RoomEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const connRef = useRef<RoomConnection | null>(null);

  useEffect(() => {
    if (!isValidRoomCode(roomCode)) {
      setClosed("room_not_found");
      return;
    }
    let disposed = false;

    (async () => {
      await ensureGuestSession();
      if (disposed) return;
      const conn = new RoomConnection(roomCode, getToken()!, {
        onState: (r, y) => {
          setRoom(r);
          setYou(y);
        },
        onEvent: (e) => setFeed((f) => [...f.slice(-19), e]),
        onStatus: setStatus,
        onClosed: setClosed,
      });
      connRef.current = conn;
      conn.connect();
    })();

    return () => {
      disposed = true;
      connRef.current?.dispose();
      connRef.current = null;
    };
  }, [roomCode]);

  const copyInvite = useCallback(() => {
    navigator.clipboard.writeText(`${location.origin}/r/${roomCode}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [roomCode]);

  if (closed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
        <p className="text-lg text-ink-muted">{CLOSED_MESSAGES[closed]}</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-xl bg-accent px-7 py-3 font-semibold text-bg transition hover:brightness-110"
        >
          Back to home
        </button>
      </div>
    );
  }

  const isOwner = you !== null && room?.ownerSessionId === you;

  return (
    <div className="flex h-full flex-col items-center px-4 py-8 sm:py-12">
      {status !== "connected" && (
        <div className="glass mb-4 rounded-full px-5 py-2 text-sm text-ink-muted">
          {status === "connecting" ? "Connecting…" : "Connection lost — reconnecting…"}
        </div>
      )}

      <header className="mb-8 text-center">
        <div className="text-sm tracking-wide text-ink-muted uppercase">Room code</div>
        <button
          onClick={copyInvite}
          title="Copy invite link"
          className="font-(family-name:--font-display) mt-1 text-5xl font-bold tracking-[0.25em] transition hover:text-accent sm:text-6xl"
        >
          {roomCode}
        </button>
        <div className="mt-2 h-5 text-sm text-ink-muted">
          {copied ? "Invite link copied!" : "Click the code to copy the invite link"}
        </div>
      </header>

      <main className="glass w-full max-w-2xl rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">
            Players{" "}
            <span className="text-ink-muted">
              {room ? `${room.members.length}/${room.maxPlayers}` : ""}
            </span>
          </h2>
          <button
            onClick={() => connRef.current?.leave()}
            className="rounded-lg px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10"
          >
            Leave room
          </button>
        </div>

        <ul className="space-y-2">
          {(room?.members ?? []).map((m) => (
            <li
              key={m.sessionId}
              className={`flex items-center gap-3 rounded-xl bg-surface-raised/60 px-4 py-3 ${
                m.connected ? "" : "opacity-50"
              }`}
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: m.avatarColor }}
              />
              <span className="font-medium">{m.name}</span>
              {m.sessionId === room?.ownerSessionId && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                  host
                </span>
              )}
              {m.sessionId === you && (
                <span className="rounded-full bg-line px-2 py-0.5 text-xs text-ink-muted">you</span>
              )}
              {!m.connected && <span className="text-xs text-ink-muted">reconnecting…</span>}

              {isOwner && m.sessionId !== you && (
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() =>
                      connRef.current?.send({ type: "transfer_owner", sessionId: m.sessionId })
                    }
                    className="rounded-lg px-2 py-1 text-xs text-ink-muted transition hover:bg-line hover:text-ink"
                  >
                    Make host
                  </button>
                  <button
                    onClick={() => connRef.current?.send({ type: "kick", sessionId: m.sessionId })}
                    className="rounded-lg px-2 py-1 text-xs text-danger transition hover:bg-danger/10"
                  >
                    Kick
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl border border-dashed border-line p-5 text-center text-sm text-ink-muted">
          Game picker lands in Sprint 4 — invite friends and hang out meanwhile.
        </div>
      </main>

      {feed.length > 0 && (
        <footer className="mt-6 w-full max-w-2xl space-y-1 text-sm text-ink-muted">
          {feed.slice(-5).map((e, i) => (
            <div key={`${e.at}-${i}`} className="px-2">
              {eventLine(e)}
            </div>
          ))}
        </footer>
      )}
    </div>
  );
}
