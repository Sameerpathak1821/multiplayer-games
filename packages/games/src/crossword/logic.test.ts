import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, makeTestPlayers } from "@gamehub/game-sdk";
import { PUZZLES } from "./puzzles";
import { crossword, deriveEntries, type CrosswordState } from "./logic";
import { GUESS_COOLDOWN_MS, entryCells, type CrosswordView } from "./types";

describe("puzzle bank integrity", () => {
  it("every puzzle has consistent intersections and sane dimensions", () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.width).toBeLessThanOrEqual(12);
      expect(puzzle.height).toBeLessThanOrEqual(12);
      const letterAt = new Map<number, string>();
      for (const w of puzzle.words) {
        expect(w.answer).toMatch(/^[A-Z]{2,}$/);
        expect(w.clue.length).toBeGreaterThan(0);
        const cells = entryCells(
          { row: w.row, col: w.col, len: w.answer.length, dir: w.dir },
          puzzle.width,
        );
        cells.forEach((cell, i) => {
          const row = Math.floor(cell / puzzle.width);
          const col = cell % puzzle.width;
          expect(row).toBeLessThan(puzzle.height);
          expect(col).toBeLessThan(puzzle.width);
          const existing = letterAt.get(cell);
          const letter = w.answer[i]!;
          if (existing !== undefined) {
            expect(existing, `${puzzle.id}: conflict at r${row}c${col}`).toBe(letter);
          }
          letterAt.set(cell, letter);
        });
      }
    }
  });

  it("derives unique entry ids per puzzle", () => {
    for (const puzzle of PUZZLES) {
      const ids = deriveEntries(puzzle).map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("crossword race", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  function game(playerCount = 2) {
    const h = createHarness(crossword, makeTestPlayers(playerCount));
    const state = h.state as CrosswordState;
    return { h, state };
  }

  it("correct guess fills letters and scores; wrong guess sets cooldown", () => {
    const { h } = game();
    const entry = (h.state as CrosswordState).entries[0]!;

    // Wrong guess (right length, wrong letters — flip the last letter).
    const wrong = entry.answer.slice(0, -1) + (entry.answer.at(-1) === "A" ? "B" : "A");
    expect(h.send("p1", { entryId: entry.id, answer: wrong })).toBe(true);
    let view = h.view("p1") as CrosswordView;
    expect(Object.keys(view.you!.letters)).toHaveLength(0);
    expect(view.you!.cooldownUntil[entry.id]).toBe(Date.now() + GUESS_COOLDOWN_MS);

    // Cooldown blocks another attempt until it expires.
    expect(h.send("p1", { entryId: entry.id, answer: entry.answer })).toBe(false);
    vi.advanceTimersByTime(GUESS_COOLDOWN_MS + 1);
    expect(h.send("p1", { entryId: entry.id, answer: entry.answer })).toBe(true);

    view = h.view("p1") as CrosswordView;
    expect(view.you!.solved).toEqual([entry.id]);
    expect(view.you!.score).toBe(entry.len * 10);
    expect(Object.keys(view.you!.letters)).toHaveLength(entry.cells.length);
  });

  it("rejects wrong length, unknown entries, and resolving a solved clue", () => {
    const { h } = game();
    const entry = (h.state as CrosswordState).entries[0]!;
    expect(h.send("p1", { entryId: entry.id, answer: "A".repeat(entry.len + 1) })).toBe(false);
    expect(h.send("p1", { entryId: "99Z", answer: "AAA" })).toBe(false);
    h.send("p1", { entryId: entry.id, answer: entry.answer });
    expect(h.send("p1", { entryId: entry.id, answer: entry.answer })).toBe(false);
  });

  it("first player to finish ends the race with the finish bonus and wins", () => {
    const { h } = game();
    const entries = (h.state as CrosswordState).entries;
    for (const e of entries) expect(h.send("p1", { entryId: e.id, answer: e.answer })).toBe(true);

    const result = h.result();
    expect(result).not.toBeNull();
    expect(result!.placements[0]).toEqual(["p1"]);
    const expected = entries.reduce((s, e) => s + e.len * 10, 0) + 50;
    expect(result!.scores!.p1).toBe(expected);
    // Race over: p2 can no longer submit.
    expect(h.send("p2", { entryId: entries[0]!.id, answer: entries[0]!.answer })).toBe(false);
  });

  it("timeUp ends the game and ranks by score", () => {
    const { h } = game();
    const entries = (h.state as CrosswordState).entries;
    h.send("p1", { entryId: entries[0]!.id, answer: entries[0]!.answer });

    const timedOut = crossword.timeUp!(h.state as CrosswordState);
    const result = crossword.isOver(timedOut);
    expect(result).not.toBeNull();
    expect(result!.placements[0]).toEqual(["p1"]);
    expect(result!.placements[1]).toEqual(["p2"]);
  });

  it("never leaks answers: not to players, not to spectators, not for rivals", () => {
    const { h } = game();
    const entries = (h.state as CrosswordState).entries;
    h.send("p1", { entryId: entries[0]!.id, answer: entries[0]!.answer });

    for (const viewer of ["p2", null] as const) {
      const view = h.view(viewer) as CrosswordView;
      const json = JSON.stringify(view);
      for (const e of entries) {
        expect((view.entries[0] as { answer?: string }).answer).toBeUndefined();
        expect(json.includes(`"${e.answer}"`)).toBe(false);
      }
      // p2/spectator sees p1's progress as a mask only.
      const rival = view.rivals.find((r) => r.sessionId === "p1")!;
      expect(rival.filled.length).toBe(entries[0]!.cells.length);
      expect(rival.score).toBe(entries[0]!.len * 10);
    }

    // Spectators have no personal board at all.
    expect((h.view(null) as CrosswordView).you).toBeNull();
  });
});
