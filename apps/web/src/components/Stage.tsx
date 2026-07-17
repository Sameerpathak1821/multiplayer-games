import type { RoomSnapshot } from "@gamehub/shared";
import { GAME_LIST } from "@gamehub/games";
import type { GameOverMsg, GameStateMsg } from "../lib/room";
import TicTacToeBoard from "./games/TicTacToeBoard";

export interface FloatingReaction {
  id: string;
  emoji: string;
  /** Horizontal position as a percentage across the stage. */
  x: number;
  color: string;
}

const COMING_SOON = [
  { key: "crossword", displayName: "Crossword Race", note: "Sprint 6" },
  { key: "shooter", displayName: "Arena Shooter", note: "Sprint 8" },
];

interface Props {
  room: RoomSnapshot;
  you: string | null;
  isOwner: boolean;
  countdown: number | null;
  launched: boolean;
  reactions: FloatingReaction[];
  gameState: GameStateMsg | null;
  gameOver: GameOverMsg | null;
  onReady(ready: boolean): void;
  onStart(): void;
  onSelectGame(gameKey: string | null): void;
  onMove(payload: unknown): void;
}

function GameBoard({
  gameState,
  you,
  finished,
  onMove,
}: {
  gameState: GameStateMsg;
  you: string | null;
  finished: boolean;
  onMove(payload: unknown): void;
}) {
  switch (gameState.gameKey) {
    case "tic-tac-toe":
      return (
        <TicTacToeBoard
          game={gameState}
          you={you}
          finished={finished}
          onMove={(cell) => onMove({ cell })}
        />
      );
    default:
      return <p className="text-ink-muted">Unknown game: {gameState.gameKey}</p>;
  }
}

export default function Stage({
  room,
  you,
  isOwner,
  countdown,
  launched,
  reactions,
  gameState,
  gameOver,
  onReady,
  onStart,
  onSelectGame,
  onMove,
}: Props) {
  const me = room.members.find((m) => m.sessionId === you);
  const connected = room.members.filter((m) => m.connected);
  const readyCount = connected.filter((m) => m.ready).length;
  const allReady = connected.length > 0 && connected.every((m) => m.ready);
  const selected = GAME_LIST.find((g) => g.key === room.gameKey);
  const enoughPlayers = !selected || connected.length >= selected.minPlayers;

  function resultLine(): string {
    if (!gameOver) return "";
    if (gameOver.forfeit) {
      const winners = gameOver.result.placements[0] ?? [];
      const winnerNames = winners
        .map((id) => (id === you ? "You" : gameState?.players.find((p) => p.sessionId === id)?.name))
        .filter(Boolean)
        .join(" & ");
      return `${gameOver.forfeit.sessionId === you ? "You" : gameOver.forfeit.name} left the match — ${winnerNames} win${winners.length === 1 && winners[0] !== you ? "s" : ""}!`;
    }
    if (gameOver.result.draw) return "It's a draw!";
    const winnerId = gameOver.result.placements[0]?.[0];
    if (!winnerId) return "Game over";
    if (winnerId === you) return "You win! 🎉";
    const name = gameState?.players.find((p) => p.sessionId === winnerId)?.name ?? "Someone";
    return `${name} wins!`;
  }

  const readyControls = (
    <div className="flex flex-col items-center gap-2.5">
      <button
        onClick={() => onReady(!me?.ready)}
        className={`rounded-xl px-7 py-3 font-semibold transition active:scale-[0.98] ${
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
          disabled={!allReady || !enoughPlayers}
          className="rounded-xl bg-accent-2 px-7 py-3 font-semibold text-bg transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !enoughPlayers
              ? `${selected?.displayName} needs at least ${selected?.minPlayers} players`
              : allReady
                ? "Start!"
                : "Everyone must be ready first"
          }
        >
          {room.phase === "postgame" ? "Rematch" : "Start game"}
        </button>
      )}
      <p className="text-xs text-ink-muted">
        {readyCount}/{connected.length} ready
        {selected && !enoughPlayers && ` — need ${selected.minPlayers} players`}
      </p>
    </div>
  );

  return (
    <div className="glass relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-5">
      {/* Floating emoji reactions overlay */}
      <div className="pointer-events-none absolute inset-0 z-20">
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

      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <div
            key={countdown}
            className="countdown-pop font-(family-name:--font-display) text-9xl font-bold text-accent"
          >
            {countdown}
          </div>
        </div>
      )}

      {room.phase === "playing" && gameState ? (
        <GameBoard gameState={gameState} you={you} finished={false} onMove={onMove} />
      ) : room.phase === "postgame" ? (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5">
          {gameState && (
            <div className="max-h-[45%] shrink-0">
              <GameBoard gameState={gameState} you={you} finished onMove={() => {}} />
            </div>
          )}
          <div className="text-center">
            <div className="font-(family-name:--font-display) text-2xl font-bold">
              {resultLine()}
            </div>
          </div>
          {readyControls}
          {isOwner && (
            <button
              onClick={() => onSelectGame(null)}
              className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Choose a different game
            </button>
          )}
        </div>
      ) : launched && !room.gameKey ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="font-(family-name:--font-display) text-3xl font-bold text-success">
            Everyone's in! 🎉
          </div>
          <p className="mt-3 max-w-sm text-ink-muted">Pick a game to actually play something.</p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-6">
          {/* Game picker */}
          <div>
            <p className="mb-3 text-center text-sm text-ink-muted">
              {isOwner ? "Pick a game" : "The host picks the game"}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {GAME_LIST.map((g) => (
                <button
                  key={g.key}
                  onClick={() => isOwner && onSelectGame(room.gameKey === g.key ? null : g.key)}
                  disabled={!isOwner}
                  className={`w-44 rounded-2xl p-4 text-left transition ${
                    room.gameKey === g.key
                      ? "bg-accent/15 ring-2 ring-accent"
                      : "bg-surface-raised/70 " + (isOwner ? "hover:bg-line/60" : "")
                  }`}
                >
                  <div className="text-2xl">⭕</div>
                  <div className="mt-1.5 font-semibold">{g.displayName}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">{g.description}</div>
                  <div className="mt-1 text-[10px] text-ink-muted">
                    {g.minPlayers === g.maxPlayers
                      ? `${g.minPlayers} players`
                      : `${g.minPlayers}–${g.maxPlayers} players`}
                  </div>
                </button>
              ))}
              {COMING_SOON.map((g) => (
                <div
                  key={g.key}
                  className="w-44 rounded-2xl bg-surface-raised/40 p-4 opacity-50"
                  title="Coming soon"
                >
                  <div className="text-2xl">🔒</div>
                  <div className="mt-1.5 font-semibold">{g.displayName}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">Coming in {g.note}</div>
                </div>
              ))}
            </div>
          </div>

          {room.gameKey && readyControls}
        </div>
      )}
    </div>
  );
}
