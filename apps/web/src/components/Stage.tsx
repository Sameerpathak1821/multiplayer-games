import type { RoomSnapshot } from "@gamehub/shared";

export interface FloatingReaction {
  id: string;
  emoji: string;
  /** Horizontal position as a percentage across the stage. */
  x: number;
  color: string;
}

interface Props {
  room: RoomSnapshot;
  you: string | null;
  isOwner: boolean;
  countdown: number | null;
  launched: boolean;
  reactions: FloatingReaction[];
  onReady(ready: boolean): void;
  onStart(): void;
}

export default function Stage({
  room,
  you,
  isOwner,
  countdown,
  launched,
  reactions,
  onReady,
  onStart,
}: Props) {
  const me = room.members.find((m) => m.sessionId === you);
  const connected = room.members.filter((m) => m.connected);
  const readyCount = connected.filter((m) => m.ready).length;
  const allReady = connected.length > 0 && connected.every((m) => m.ready);

  return (
    <div className="glass relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden rounded-2xl p-6">
      {/* Floating emoji reactions overlay */}
      <div className="pointer-events-none absolute inset-0">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="reaction-float absolute bottom-10 text-4xl"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {countdown !== null ? (
        <div
          key={countdown}
          className="countdown-pop font-(family-name:--font-display) text-9xl font-bold text-accent"
        >
          {countdown}
        </div>
      ) : launched ? (
        <div className="text-center">
          <div className="font-(family-name:--font-display) text-3xl font-bold text-success">
            Everyone's in! 🎉
          </div>
          <p className="mt-3 max-w-sm text-ink-muted">
            This is where the game launches — the game picker and Tic-Tac-Toe arrive in Sprint 4.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <div className="font-(family-name:--font-display) text-2xl font-bold">
            {allReady ? "All players ready!" : "Waiting for players…"}
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {readyCount}/{connected.length} ready
          </p>

          <div className="mt-7 flex flex-col items-center gap-3">
            <button
              onClick={() => onReady(!me?.ready)}
              className={`rounded-xl px-8 py-3.5 font-semibold transition active:scale-[0.98] ${
                me?.ready
                  ? "bg-success/15 text-success ring-1 ring-success/40"
                  : "bg-accent text-bg hover:brightness-110"
              }`}
            >
              {me?.ready ? "✓ Ready — tap to cancel" : "I'm ready"}
            </button>

            {isOwner && (
              <button
                onClick={onStart}
                disabled={!allReady}
                className="rounded-xl bg-accent-2 px-8 py-3.5 font-semibold text-bg transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                title={allReady ? "Start!" : "Everyone must be ready first"}
              >
                Start countdown
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
