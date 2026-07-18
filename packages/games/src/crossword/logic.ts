import type { GameDefinition, GameResult, Player } from "@gamehub/game-sdk";
import { PUZZLES, type CrosswordPuzzle, type Dir } from "./puzzles";
import {
  CROSSWORD_DURATION_MS,
  FINISH_BONUS,
  GUESS_COOLDOWN_MS,
  POINTS_PER_LETTER,
  entryCells,
  type CrosswordView,
} from "./types";

/** Server-side entry: the public clue plus its answer and cell indices. */
export interface CrosswordEntry {
  id: string;
  number: number;
  dir: Dir;
  row: number;
  col: number;
  len: number;
  clue: string;
  answer: string;
  cells: number[];
}

interface PlayerBoard {
  letters: Record<number, string>;
  solved: string[];
  score: number;
  cooldownUntil: Record<string, number>;
  finishedAt: number | null;
}

export interface CrosswordState {
  puzzleId: string;
  title: string;
  width: number;
  height: number;
  entries: CrosswordEntry[];
  players: Record<string, PlayerBoard>;
  endsAt: number;
  ended: boolean;
}

export interface CrosswordIntent {
  entryId: string;
  answer: string;
}

/** Standard crossword numbering: start cells numbered in row-major order. */
export function deriveEntries(puzzle: CrosswordPuzzle): CrosswordEntry[] {
  const startKeys = [...new Set(puzzle.words.map((w) => w.row * puzzle.width + w.col))].sort(
    (a, b) => a - b,
  );
  const numberOf = new Map(startKeys.map((k, i) => [k, i + 1]));

  return puzzle.words.map((w) => {
    const number = numberOf.get(w.row * puzzle.width + w.col)!;
    const len = w.answer.length;
    return {
      id: `${number}${w.dir === "across" ? "A" : "D"}`,
      number,
      dir: w.dir,
      row: w.row,
      col: w.col,
      len,
      clue: w.clue,
      answer: w.answer.toUpperCase(),
      cells: entryCells({ row: w.row, col: w.col, len, dir: w.dir }, puzzle.width),
    };
  });
}

function emptyBoard(): PlayerBoard {
  return { letters: {}, solved: [], score: 0, cooldownUntil: {}, finishedAt: null };
}

function rankPlayers(state: CrosswordState): string[][] {
  const ids = Object.keys(state.players);
  const sorted = [...ids].sort((a, b) => {
    const pa = state.players[a]!;
    const pb = state.players[b]!;
    if (pb.score !== pa.score) return pb.score - pa.score;
    const fa = pa.finishedAt ?? Number.POSITIVE_INFINITY;
    const fb = pb.finishedAt ?? Number.POSITIVE_INFINITY;
    return fa - fb;
  });
  const groups: string[][] = [];
  for (const id of sorted) {
    const prev = groups.at(-1);
    if (
      prev &&
      state.players[prev[0]!]!.score === state.players[id]!.score &&
      (state.players[prev[0]!]!.finishedAt === null) === (state.players[id]!.finishedAt === null)
    ) {
      prev.push(id);
    } else {
      groups.push([id]);
    }
  }
  return groups;
}

export const crossword: GameDefinition<CrosswordState, CrosswordIntent> = {
  key: "crossword",
  displayName: "Crossword Race",
  minPlayers: 1,
  maxPlayers: 8,
  mode: "turn",
  durationMs: CROSSWORD_DURATION_MS,

  init(players: Player[], settings): CrosswordState {
    const puzzle = PUZZLES[Math.floor(Math.random() * PUZZLES.length)]!;
    const durationMs =
      typeof settings.durationMs === "number" ? settings.durationMs : CROSSWORD_DURATION_MS;
    return {
      puzzleId: puzzle.id,
      title: puzzle.title,
      width: puzzle.width,
      height: puzzle.height,
      entries: deriveEntries(puzzle),
      players: Object.fromEntries(players.map((p) => [p.id, emptyBoard()])),
      endsAt: Date.now() + durationMs,
      ended: false,
    };
  },

  validate(state, playerId, intent) {
    if (state.ended) return false;
    const board = state.players[playerId];
    if (!board || board.finishedAt !== null) return false;
    if (typeof intent !== "object" || intent === null) return false;
    const { entryId, answer } = intent as CrosswordIntent;
    if (typeof entryId !== "string" || typeof answer !== "string") return false;
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return false;
    if (board.solved.includes(entryId)) return false;
    if ((board.cooldownUntil[entryId] ?? 0) > Date.now()) return false;
    return /^[a-zA-Z]+$/.test(answer) && answer.length === entry.len;
  },

  apply(state, playerId, intent) {
    const board = state.players[playerId]!;
    const entry = state.entries.find((e) => e.id === intent.entryId)!;
    const guess = intent.answer.toUpperCase();

    if (guess !== entry.answer) {
      // Wrong: lock this clue for a beat so nobody brute-forces it.
      const cooldownUntil = {
        ...board.cooldownUntil,
        [entry.id]: Date.now() + GUESS_COOLDOWN_MS,
      };
      return {
        ...state,
        players: { ...state.players, [playerId]: { ...board, cooldownUntil } },
      };
    }

    const letters = { ...board.letters };
    entry.cells.forEach((cell, i) => (letters[cell] = entry.answer[i]!));
    const solved = [...board.solved, entry.id];
    const finished = solved.length === state.entries.length;
    const score = board.score + entry.len * POINTS_PER_LETTER + (finished ? FINISH_BONUS : 0);
    const next: PlayerBoard = {
      ...board,
      letters,
      solved,
      score,
      finishedAt: finished ? Date.now() : null,
    };
    return {
      ...state,
      // First player to complete the grid ends the race for everyone.
      ended: state.ended || finished,
      players: { ...state.players, [playerId]: next },
    };
  },

  timeUp(state) {
    return { ...state, ended: true };
  },

  visibleStateFor(state, viewerId): CrosswordView {
    const cells = [...new Set(state.entries.flatMap((e) => e.cells))].sort((a, b) => a - b);
    const numbers: Record<number, number> = {};
    for (const e of state.entries) numbers[e.cells[0]!] = e.number;

    const yours = viewerId ? state.players[viewerId] : undefined;
    return {
      puzzleId: state.puzzleId,
      title: state.title,
      width: state.width,
      height: state.height,
      cells,
      numbers,
      entries: state.entries.map(({ id, number, dir, row, col, len, clue }) => ({
        id,
        number,
        dir,
        row,
        col,
        len,
        clue,
      })),
      endsAt: state.endsAt,
      ended: state.ended,
      you: yours
        ? {
            letters: yours.letters,
            solved: yours.solved,
            score: yours.score,
            cooldownUntil: yours.cooldownUntil,
            finishedAt: yours.finishedAt,
          }
        : null,
      rivals: Object.entries(state.players)
        .filter(([id]) => id !== viewerId)
        .map(([sessionId, b]) => ({
          sessionId,
          filled: Object.keys(b.letters).map(Number),
          solvedCount: b.solved.length,
          score: b.score,
          finished: b.finishedAt !== null,
        })),
    };
  },

  isOver(state): GameResult | null {
    if (!state.ended) return null;
    const placements = rankPlayers(state);
    return {
      placements,
      scores: Object.fromEntries(Object.entries(state.players).map(([id, b]) => [id, b.score])),
    };
  },
};
