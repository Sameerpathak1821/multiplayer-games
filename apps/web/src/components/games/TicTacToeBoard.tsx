import { useEffect, useState } from "react";
import { winnerInfo, type TicTacToeState } from "@gamehub/games";
import type { GameStateMsg } from "../../lib/room";

const SEAT_COLORS = { X: "var(--color-accent)", O: "var(--color-accent-2)" } as const;

interface Props {
  game: GameStateMsg;
  you: string | null;
  finished: boolean;
  onMove(cell: number): void;
}

function useSecondsLeft(deadline: number | undefined): number | null {
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

export default function TicTacToeBoard({ game, you, finished, onMove }: Props) {
  const view = game.view as TicTacToeState;
  const info = winnerInfo(view.board);
  const winLine = info !== null && info !== "draw" ? info.line : null;
  const secondsLeft = useSecondsLeft(finished ? undefined : game.turn?.deadline);

  const yourSeat = you === view.xId ? "X" : you === view.oId ? "O" : null;
  const isYourTurn = !finished && game.turn?.sessionId === you;
  const turnPlayer = game.players.find((p) => p.sessionId === game.turn?.sessionId);

  const seatFor = (sessionId: string) => (sessionId === view.xId ? "X" : "O");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      {/* Seats */}
      <div className="flex items-center gap-6">
        {game.players.map((p) => {
          const seat = seatFor(p.sessionId);
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

      {/* Board */}
      <div className="grid grid-cols-3 gap-2.5">
        {view.board.map((cell, i) => {
          const inWin = winLine?.includes(i as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) ?? false;
          const canPlay = isYourTurn && cell === null && yourSeat !== null;
          return (
            <button
              key={i}
              onClick={() => canPlay && onMove(i)}
              disabled={!canPlay}
              className={`flex size-20 items-center justify-center rounded-2xl text-4xl font-bold transition sm:size-24 ${
                inWin
                  ? "bg-accent/20 ring-2 ring-accent"
                  : "bg-surface-raised/80 " + (canPlay ? "hover:bg-line/70 cursor-pointer" : "")
              }`}
              style={cell ? { color: SEAT_COLORS[cell] } : undefined}
            >
              {cell}
            </button>
          );
        })}
      </div>

      {/* Turn status */}
      {!finished && (
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
      )}
    </div>
  );
}
