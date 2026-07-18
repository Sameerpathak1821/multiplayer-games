import type { GameDefinition } from "@gamehub/game-sdk";
import { ticTacToe } from "./tic-tac-toe/logic";
import { crossword } from "./crossword/logic";
import { arena } from "./arena/logic";
import { shooter } from "./shooter/logic";

// Server-side surface: registry + full logic (crossword answers included).
// Browsers import "@gamehub/games/client" instead.
export * from "./client";
export { crossword, deriveEntries, type CrosswordState, type CrosswordIntent } from "./crossword/logic";
export { PUZZLES, type CrosswordPuzzle, type PlacedWord } from "./crossword/puzzles";
export { arena, type ArenaState } from "./arena/logic";
export { shooter, type ShooterState } from "./shooter/logic";

/** Every playable game, by key. The server room runs games out of this map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_REGISTRY: Record<string, GameDefinition<any, any>> = {
  [ticTacToe.key]: ticTacToe,
  [crossword.key]: crossword,
  [arena.key]: arena,
  [shooter.key]: shooter,
};
