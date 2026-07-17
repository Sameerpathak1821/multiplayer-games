import type { GameDefinition } from "@gamehub/game-sdk";
import { ticTacToe } from "./tic-tac-toe/logic";

export {
  ticTacToe,
  winnerInfo,
  seatOf,
  type TicTacToeState,
  type TicTacToeIntent,
  type Seat,
  type Cell,
} from "./tic-tac-toe/logic";

/** Every playable game, by key. The server room runs games out of this map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_REGISTRY: Record<string, GameDefinition<any, any>> = {
  [ticTacToe.key]: ticTacToe,
};

export interface GameListing {
  key: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

/** Display metadata for pickers. */
export const GAME_LIST: GameListing[] = [
  {
    key: ticTacToe.key,
    displayName: ticTacToe.displayName,
    description: "The classic 3×3 duel. 20s per move.",
    minPlayers: ticTacToe.minPlayers,
    maxPlayers: ticTacToe.maxPlayers,
  },
];
