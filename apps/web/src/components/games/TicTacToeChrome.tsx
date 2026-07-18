import { useEffect, useState } from "react";
import type { TicTacToeState } from "@gamehub/games";
import type { GameStateMsg } from "../../lib/room";

export const SEAT_COLORS = { X: "var(--color-accent)", O: "var(--color-accent-2)" } as const;

export function useSecondsLeft(deadline: number | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);
  return left;
}

export function SeatsRow({ game, you, finished }: { game: GameStateMsg; you: string | null; finished: boolean }) {
  const view = game.view as TicTacToeState;
  return (
    <div className="flex items-center gap-6">
      {game.players.map((p) => {
        const seat = p.sessionId === view.xId ? "X" : "O";
        const active = !finished && game.turn?.sessionId === p.sessionId;
        return (
          <div
            key={p.sessionId}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition ${
              active ? "glass ring-1 ring-accent/60" : "opacity-70"
            }`}
          >
            <span className="text-lg font-bold" style={{ color: SEAT_COLORS[seat] }}>
              {seat}
            </span>
            <span className="font-medium">{p.sessionId === you ? "you" : p.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TurnStatus({ game, you, finished }: { game: GameStateMsg; you: string | null; finished: boolean }) {
  const view = game.view as TicTacToeState;
  const yourSeat = you === view.xId ? "X" : you === view.oId ? "O" : null;
  const isYourTurn = !finished && game.turn?.sessionId === you;
  const turnPlayer = game.players.find((p) => p.sessionId === game.turn?.sessionId);
  const secondsLeft = useSecondsLeft(finished ? undefined : game.turn?.deadline);

  if (finished) return null;
  return (
    <div className="flex h-8 items-center gap-3 text-sm">
      {yourSeat === null ? (
        <span className="glass rounded-full px-4 py-1.5 text-ink-muted">👀 Spectating</span>
      ) : isYourTurn ? (
        <span className="font-semibold text-accent">Your turn</span>
      ) : (
        <span className="text-ink-muted">{turnPlayer?.name ?? "…"}'s turn</span>
      )}
      {secondsLeft !== null && (
        <span
          className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${
            secondsLeft <= 5 ? "bg-danger/15 text-danger" : "bg-line/60 text-ink-muted"
          }`}
        >
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}
