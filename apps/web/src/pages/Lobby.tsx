import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ChatMessage, RoomEvent, RoomSnapshot } from "@gamehub/shared";
import { AVATAR_COLORS, isValidRoomCode } from "@gamehub/shared";
import { ensureGuestSession, getToken } from "../lib/session";
import { getGfxPref, setGfxPref, systemAllows3D, type GfxPref } from "../lib/quality";
import {
  RoomConnection,
  type ClosedReason,
  type ConnectionStatus,
  type GameOverMsg,
  type GameStateMsg,
} from "../lib/room";
import ChatPanel from "../components/ChatPanel";
import PlayerList from "../components/PlayerList";
import Stage, { type FloatingReaction } from "../components/Stage";

const CLOSED_MESSAGES: Record<Exclude<ClosedReason, "wrong_password">, string> = {
  left: "You left the room.",
  kicked: "You were removed from the room by the host.",
  banned: "You were removed from the room by the host.",
  room_full: "That room is full.",
  room_not_found: "That room doesn't exist (or has ended).",
  error: "Lost connection to the room.",
};

function eventLine(e: RoomEvent): string {
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
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [launched, setLaunched] = useState(false);
  const [gameState, setGameState] = useState<GameStateMsg | null>(null);
  const [gameOver, setGameOver] = useState<GameOverMsg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [gfx, setGfx] = useState<GfxPref>(getGfxPref);
  const [ping, setPing] = useState<number | null>(null);
  const connRef = useRef<RoomConnection | null>(null);

  const openConnection = useCallback(
    (password?: string) => {
      connRef.current?.dispose();
      const conn = new RoomConnection(
        roomCode,
        getToken()!,
        {
          onState: (r, y) => {
            setRoom(r);
            setYou(y);
            setNeedsPassword(false);
          },
          onEvent: (e) => setFeed((f) => [...f.slice(-19), e]),
          onChat: (m) => setChat((c) => [...c.slice(-99), m]),
          onChatHistory: (msgs) => setChat(msgs),
          onReaction: (r) => {
            const id = `${r.at}-${r.sessionId}-${Math.random()}`;
            const member = (roomRef.current?.members ?? []).find(
              (m) => m.sessionId === r.sessionId,
            );
            setReactions((rs) => [
              ...rs.slice(-30),
              {
                id,
                emoji: r.emoji,
                x: 10 + Math.random() * 80,
                color: member?.avatarColor ?? AVATAR_COLORS[0],
              },
            ]);
            setTimeout(() => setReactions((rs) => rs.filter((fr) => fr.id !== id)), 2500);
          },
          onCountdown: (n) => {
            setLaunched(false);
            setCountdown(n);
          },
          onLaunch: () => {
            setCountdown(null);
            setLaunched(true);
            setTimeout(() => setLaunched(false), 4000);
          },
          onGameState: (gs) => {
            setCountdown(null);
            setGameState(gs);
          },
          onGameOver: (o) => setGameOver(o),
          onError: (_code, message) => setToast(message),
          onPing: setPing,
          onStatus: setStatus,
          onClosed: (reason) => {
            if (reason === "wrong_password") {
              setNeedsPassword(true);
            } else {
              setClosed(reason);
            }
          },
        },
        password,
      );
      connRef.current = conn;
      conn.connect();
    },
    [roomCode],
  );

  // Keep the latest room snapshot readable from stable callbacks.
  const roomRef = useRef<RoomSnapshot | null>(null);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Reset game panels when the room returns to the lobby / a new game starts.
  useEffect(() => {
    if (room?.phase === "lobby") {
      setGameState(null);
      setGameOver(null);
    } else if (room?.phase === "playing") {
      setGameOver(null);
    }
  }, [room?.phase]);

  useEffect(() => {
    if (!isValidRoomCode(roomCode)) {
      setClosed("room_not_found");
      return;
    }
    let disposed = false;

    (async () => {
      await ensureGuestSession();
      if (disposed) return;
      // Ask first whether the room needs a password, to prompt before connecting.
      const info = await fetch(`/api/rooms/${roomCode}`).then((r) => r.json());
      if (disposed) return;
      if (!info.exists) {
        setClosed("room_not_found");
        return;
      }
      if (info.hasPassword) {
        setNeedsPassword(true);
        return;
      }
      openConnection();
    })();

    return () => {
      disposed = true;
      connRef.current?.dispose();
      connRef.current = null;
    };
  }, [roomCode, openConnection]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const copyInvite = useCallback(() => {
    navigator.clipboard.writeText(`${location.origin}/r/${roomCode}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [roomCode]);

  if (closed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
        <p className="text-lg text-ink-muted">{CLOSED_MESSAGES[closed as keyof typeof CLOSED_MESSAGES]}</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-xl bg-accent px-7 py-3 font-semibold text-bg transition hover:brightness-110"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
        <div className="text-4xl">🔒</div>
        <p className="text-lg">
          Room <span className="font-mono font-bold tracking-widest">{roomCode}</span> is private
        </p>
        <div className="glass flex items-center gap-2 rounded-xl p-1.5">
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pwInput && openConnection(pwInput)}
            placeholder="Password"
            autoFocus
            className="w-48 bg-transparent px-3 py-2 outline-none placeholder:text-ink-muted/60"
          />
          <button
            onClick={() => pwInput && openConnection(pwInput)}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-bg transition hover:brightness-110"
          >
            Enter
          </button>
        </div>
        <button onClick={() => navigate("/")} className="text-sm text-ink-muted hover:text-ink">
          Back to home
        </button>
      </div>
    );
  }

  const isOwner = you !== null && room?.ownerSessionId === you;

  return (
    <div className="flex h-full flex-col px-4 py-4 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-between">
        <div className="font-(family-name:--font-display) text-lg font-bold tracking-tight">
          Game<span className="text-accent">Hub</span>
        </div>
        <button
          onClick={copyInvite}
          title="Copy invite link"
          className="font-(family-name:--font-display) text-3xl font-bold tracking-[0.25em] transition hover:text-accent"
        >
          {room?.hasPassword && <span className="mr-2 text-xl align-middle">🔒</span>}
          {roomCode}
        </button>
        <div className="flex w-48 items-center justify-center gap-3 sm:justify-end">
          <span className="text-xs text-ink-muted">
            {status !== "connected"
              ? status === "connecting"
                ? "Connecting…"
                : "Reconnecting…"
              : copied
                ? "Invite link copied!"
                : "Click code to copy link"}
          </span>
          {ping !== null && status === "connected" && (
            <span
              className={`font-mono text-[10px] ${ping < 80 ? "text-success" : ping < 200 ? "text-ink-muted" : "text-danger"}`}
              title="Connection latency"
            >
              {ping}ms
            </span>
          )}
          {systemAllows3D() && (
            <button
              onClick={() => {
                const next = gfx === "3d" ? "2d" : "3d";
                setGfxPref(next);
                setGfx(next);
              }}
              className="glass rounded-full px-3 py-1 text-xs font-medium transition hover:text-accent"
              title="Toggle 3D graphics"
            >
              {gfx === "3d" ? "3D ✨" : "2D"}
            </button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
        <div className="order-2 min-h-56 lg:order-1">
          {room && (
            <PlayerList
              room={room}
              you={you}
              isOwner={isOwner}
              onKick={(sid) => connRef.current?.send({ type: "kick", sessionId: sid })}
              onTransfer={(sid) => connRef.current?.send({ type: "transfer_owner", sessionId: sid })}
              onSetPassword={(password) =>
                connRef.current?.send({ type: "settings:set_password", password })
              }
              onLeave={() => connRef.current?.leave()}
            />
          )}
        </div>

        <div className="order-1 min-h-72 lg:order-2">
          {room && (
            <Stage
              room={room}
              you={you}
              isOwner={isOwner}
              countdown={countdown}
              launched={launched}
              reactions={reactions}
              gameState={gameState}
              gameOver={gameOver}
              gfx={gfx}
              ping={ping}
              onReady={(ready) => connRef.current?.send({ type: "ready:set", ready })}
              onStart={() => connRef.current?.send({ type: "countdown:start" })}
              onSelectGame={(gameKey) => connRef.current?.send({ type: "game:select", gameKey })}
              onMove={(payload) => connRef.current?.send({ type: "game:intent", payload })}
            />
          )}
        </div>

        <div className="order-3 min-h-72">
          <ChatPanel
            messages={chat}
            you={you}
            onSend={(text) => connRef.current?.send({ type: "chat:send", text })}
            onReact={(emoji) => connRef.current?.send({ type: "reaction:send", emoji })}
          />
        </div>
      </div>

      {feed.length > 0 && (
        <footer className="mt-3 truncate text-center text-xs text-ink-muted">
          {eventLine(feed[feed.length - 1]!)}
        </footer>
      )}

      {toast && (
        <div className="glass absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-xl px-5 py-3 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
