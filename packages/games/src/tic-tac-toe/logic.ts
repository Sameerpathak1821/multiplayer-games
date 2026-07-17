import type { GameDefinition, Player } from "@gamehub/game-sdk";

export type Seat = "X" | "O";
export type Cell = Seat | null;

export interface TicTacToeState {
  board: Cell[];
  xId: string;
  oId: string;
  turnSeat: Seat;
}

export interface TicTacToeIntent {
  cell: number;
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

/** Returns the winning seat + line, "draw" on a full board, or null. */
export function winnerInfo(
  board: Cell[],
): { seat: Seat; line: readonly [number, number, number] } | "draw" | null {
  for (const line of LINES) {
    const v = board[line[0]];
    if (v && v === board[line[1]] && v === board[line[2]]) {
      return { seat: v, line };
    }
  }
  return board.every((c) => c !== null) ? "draw" : null;
}

export function seatOf(state: TicTacToeState, playerId: string): Seat | null {
  if (playerId === state.xId) return "X";
  if (playerId === state.oId) return "O";
  return null;
}

export const ticTacToe: GameDefinition<TicTacToeState, TicTacToeIntent> = {
  key: "tic-tac-toe",
  displayName: "Tic-Tac-Toe",
  minPlayers: 2,
  maxPlayers: 2,
  mode: "turn",
  turnTimeoutMs: 20_000,

  init(players: Player[]): TicTacToeState {
    return {
      board: Array<Cell>(9).fill(null),
      xId: players[0]!.id,
      oId: players[1]!.id,
      turnSeat: "X",
    };
  },

  currentTurn(state) {
    return state.turnSeat === "X" ? state.xId : state.oId;
  },

  validate(state, playerId, intent) {
    if (typeof intent !== "object" || intent === null) return false;
    const cell = (intent as TicTacToeIntent).cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return false;
    if (winnerInfo(state.board) !== null) return false;
    if (state.board[cell] !== null) return false;
    return seatOf(state, playerId) === state.turnSeat;
  },

  apply(state, _playerId, intent) {
    const board = [...state.board];
    board[intent.cell] = state.turnSeat;
    return { ...state, board, turnSeat: state.turnSeat === "X" ? "O" : "X" };
  },

  // No hidden information in tic-tac-toe — everyone sees the full state.
  visibleStateFor(state) {
    return state;
  },

  isOver(state) {
    const info = winnerInfo(state.board);
    if (info === null) return null;
    if (info === "draw") return { placements: [[state.xId, state.oId]], draw: true };
    const winner = info.seat === "X" ? state.xId : state.oId;
    const loser = info.seat === "X" ? state.oId : state.xId;
    return { placements: [[winner], [loser]] };
  },
};
