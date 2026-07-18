import { winnerInfo, type TicTacToeState } from "@gamehub/games/client";
import type { GameStateMsg } from "../../lib/room";
import { SEAT_COLORS, SeatsRow, TurnStatus } from "./TicTacToeChrome";

interface Props {
  game: GameStateMsg;
  you: string | null;
  finished: boolean;
  onMove(cell: number): void;
}

/** Flat DOM board — the fallback for reduced-motion / no-WebGL / 2D preference. */
export default function TicTacToeBoard({ game, you, finished, onMove }: Props) {
  const view = game.view as TicTacToeState;
  const info = winnerInfo(view.board);
  const winLine = info !== null && info !== "draw" ? info.line : null;
  const yourSeat = you === view.xId ? "X" : you === view.oId ? "O" : null;
  const isYourTurn = !finished && game.turn?.sessionId === you;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <SeatsRow game={game} you={you} finished={finished} />

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

      <TurnStatus game={game} you={you} finished={finished} />
    </div>
  );
}
