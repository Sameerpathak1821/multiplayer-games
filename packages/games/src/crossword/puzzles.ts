/**
 * The puzzle bank. SERVER-ONLY — answers live here; the client bundle must
 * import from "@gamehub/games/client", which never touches this file.
 *
 * Puzzles are sparse crossed-word layouts: each word is placed explicitly and
 * the grid/numbering is derived. The logic tests validate every intersection.
 */

export type Dir = "across" | "down";

export interface PlacedWord {
  answer: string;
  clue: string;
  row: number;
  col: number;
  dir: Dir;
}

export interface CrosswordPuzzle {
  id: string;
  title: string;
  width: number;
  height: number;
  words: PlacedWord[];
}

export const PUZZLES: CrosswordPuzzle[] = [
  {
    id: "starter-1",
    title: "Warm-Up",
    width: 8,
    height: 7,
    words: [
      { answer: "PLANETS", clue: "They orbit the sun", row: 0, col: 3, dir: "down" },
      { answer: "PIZZA", clue: "Cheesy slice from Italy", row: 0, col: 3, dir: "across" },
      { answer: "SALAD", clue: "Healthy bowl of greens", row: 2, col: 0, dir: "across" },
      { answer: "TIGER", clue: "Striped big cat", row: 4, col: 0, dir: "across" },
      { answer: "STARS", clue: "They twinkle at night", row: 6, col: 3, dir: "across" },
      { answer: "APPLE", clue: "It keeps the doctor away", row: 0, col: 7, dir: "down" },
      { answer: "SET", clue: "Tennis match unit", row: 2, col: 0, dir: "down" },
    ],
  },
  {
    id: "code-1",
    title: "Code Mode",
    width: 9,
    height: 7,
    words: [
      { answer: "BROWSER", clue: "Chrome or Firefox", row: 0, col: 2, dir: "down" },
      { answer: "BUG", clue: "Error hiding in code", row: 0, col: 2, dir: "across" },
      { answer: "LOOP", clue: "for or while", row: 2, col: 0, dir: "across" },
      { answer: "CSS", clue: "It styles the web", row: 4, col: 0, dir: "across" },
      { answer: "REACT", clue: "Library this app is built with", row: 6, col: 2, dir: "across" },
      { answer: "GAMES", clue: "What GameHub is for", row: 0, col: 4, dir: "down" },
      { answer: "PIE", clue: "Chart with slices", row: 2, col: 3, dir: "down" },
      { answer: "EMOJI", clue: "😀, for one", row: 3, col: 4, dir: "across" },
    ],
  },
  {
    id: "world-1",
    title: "Around the World",
    width: 8,
    height: 9,
    words: [
      { answer: "EUROPE", clue: "Continent with France and Spain", row: 0, col: 3, dir: "down" },
      { answer: "EAGLE", clue: "Bird on many flags", row: 0, col: 3, dir: "across" },
      { answer: "PARIS", clue: "Capital of France", row: 2, col: 1, dir: "across" },
      { answer: "SPAIN", clue: "Madrid's country", row: 4, col: 2, dir: "across" },
      { answer: "SUSHI", clue: "Japanese rice rolls", row: 4, col: 2, dir: "down" },
    ],
  },
  {
    id: "space-1",
    title: "Blast Off",
    width: 8,
    height: 8,
    words: [
      { answer: "ROCKET", clue: "It launches into space", row: 0, col: 2, dir: "down" },
      { answer: "RADAR", clue: "It detects planes", row: 0, col: 2, dir: "across" },
      { answer: "OCEAN", clue: "Pacific or Atlantic", row: 2, col: 1, dir: "across" },
      { answer: "EARTH", clue: "Our home planet", row: 4, col: 2, dir: "across" },
      { answer: "DNA", clue: "The genetic code", row: 0, col: 4, dir: "down" },
      { answer: "HERO", clue: "One who saves the day", row: 4, col: 6, dir: "down" },
    ],
  },
];
