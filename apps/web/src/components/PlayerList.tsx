import { useState } from "react";
import type { RoomSnapshot } from "@gamehub/shared";

interface Props {
  room: RoomSnapshot;
  you: string | null;
  isOwner: boolean;
  onKick(sessionId: string): void;
  onTransfer(sessionId: string): void;
  onSetPassword(password: string | null): void;
  onLeave(): void;
}

export default function PlayerList({
  room,
  you,
  isOwner,
  onKick,
  onTransfer,
  onSetPassword,
  onLeave,
}: Props) {
  const [pwDraft, setPwDraft] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
        <span className="text-sm font-semibold">
          Players{" "}
          <span className="font-normal text-ink-muted">
            {room.members.length}/{room.maxPlayers}
          </span>
        </span>
        <button
          onClick={onLeave}
          className="rounded-lg px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10"
        >
          Leave
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {room.members.map((m) => (
          <li
            key={m.sessionId}
            className={`group flex items-center gap-2.5 rounded-xl bg-surface-raised/60 px-3 py-2.5 ${
              m.connected ? "" : "opacity-50"
            }`}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: m.avatarColor }}
            />
            <span className="truncate text-sm font-medium">{m.name}</span>

            {m.sessionId === room.ownerSessionId && (
              <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                host
              </span>
            )}
            {m.sessionId === you && (
              <span className="shrink-0 rounded-full bg-line px-1.5 py-0.5 text-[10px] text-ink-muted">
                you
              </span>
            )}
            {!m.connected && <span className="shrink-0 text-[10px] text-ink-muted">away…</span>}

            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {m.ready && m.connected && (
                <span className="text-xs text-success" title="Ready">
                  ✓ ready
                </span>
              )}
              {isOwner && m.sessionId !== you && (
                <span className="hidden gap-1 group-hover:flex">
                  <button
                    onClick={() => onTransfer(m.sessionId)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-ink-muted transition hover:bg-line hover:text-ink"
                  >
                    make host
                  </button>
                  <button
                    onClick={() => onKick(m.sessionId)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-danger transition hover:bg-danger/10"
                  >
                    kick
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className="border-t border-line/60 p-3">
          {showPw ? (
            <div className="flex gap-1.5">
              <input
                value={pwDraft}
                onChange={(e) => setPwDraft(e.target.value)}
                placeholder="Room password"
                maxLength={50}
                className="min-w-0 flex-1 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent/50"
              />
              <button
                onClick={() => {
                  if (pwDraft.trim()) onSetPassword(pwDraft.trim());
                  setPwDraft("");
                  setShowPw(false);
                }}
                className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-bg"
              >
                Set
              </button>
              <button
                onClick={() => {
                  onSetPassword(null);
                  setPwDraft("");
                  setShowPw(false);
                }}
                className="rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPw(true)}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-muted transition hover:bg-line/40"
            >
              {room.hasPassword ? "🔒 Password set — change" : "🔓 Set a room password"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
