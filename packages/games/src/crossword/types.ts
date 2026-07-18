/**
 * Client-safe crossword types: everything the browser is allowed to see.
 * No answers, no puzzle bank imports.
 */

export type CrosswordDir = "across" | "down";

/** One clue as the player sees it — the answer never leaves the server. */
export interface CrosswordEntryPub {
  id: string;
  number: number;
  dir: CrosswordDir;
  row: number;
  col: number;
  len: number;
  clue: string;
}

export interface CrosswordYou {
  /** Correctly placed letters only, keyed by cell index. */
  letters: Record<number, string>;
  solved: string[];
  score: number;
  /** Per-entry lockout after a wrong guess, as epoch ms. */
  cooldownUntil: Record<string, number>;
  finishedAt: number | null;
}

/** A rival's progress silhouette: which cells are filled, never with what. */
export interface CrosswordRival {
  sessionId: string;
  filled: number[];
  solvedCount: number;
  score: number;
  finished: boolean;
}

export interface CrosswordView {
  puzzleId: string;
  title: string;
  width: number;
  height: number;
  /** Playable cell indices (row * width + col). */
  cells: number[];
  /** Clue numbers shown in cell corners, keyed by cell index. */
  numbers: Record<number, number>;
  entries: CrosswordEntryPub[];
  endsAt: number;
  ended: boolean;
  /** Null for spectators. */
  you: CrosswordYou | null;
  rivals: CrosswordRival[];
}

export const GUESS_COOLDOWN_MS = 3000;
export const POINTS_PER_LETTER = 10;
export const FINISH_BONUS = 50;
export const CROSSWORD_DURATION_MS = 180_000;

export function entryCells(
  e: { row: number; col: number; len: number; dir: CrosswordDir },
  width: number,
): number[] {
  return Array.from({ length: e.len }, (_, i) =>
    e.dir === "across" ? e.row * width + e.col + i : (e.row + i) * width + e.col,
  );
}
