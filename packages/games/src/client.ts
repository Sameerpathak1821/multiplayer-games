/**
 * Client-safe surface of @gamehub/games. The web app imports ONLY from
 * here ("@gamehub/games/client") so secret data — like crossword answers —
 * can never end up in the browser bundle.
 */

export {
  ticTacToe,
  winnerInfo,
  seatOf,
  type TicTacToeState,
  type TicTacToeIntent,
  type Seat,
  type Cell,
} from "./tic-tac-toe/logic";

export * from "./crossword/types";

export interface GameListing {
  key: string;
  displayName: string;
  description: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
}

/** Display metadata for pickers. */
export const GAME_LIST: GameListing[] = [
  {
    key: "tic-tac-toe",
    displayName: "Tic-Tac-Toe",
    description: "The classic 3×3 duel. 20s per move.",
    icon: "⭕",
    minPlayers: 2,
    maxPlayers: 2,
  },
  {
    key: "crossword",
    displayName: "Crossword Race",
    description: "Same grid, 3 minutes — fastest solver wins.",
    icon: "🧩",
    minPlayers: 1,
    maxPlayers: 8,
  },
];
