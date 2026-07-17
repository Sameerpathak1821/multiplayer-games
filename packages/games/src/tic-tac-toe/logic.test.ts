import { describe, expect, it } from "vitest";
import { createHarness, makeTestPlayers } from "@gamehub/game-sdk";
import { ticTacToe, winnerInfo, type Cell } from "./logic";

function game() {
  return createHarness(ticTacToe, makeTestPlayers(2));
}

describe("tic-tac-toe", () => {
  it("seats first player as X and X moves first", () => {
    const h = game();
    expect(h.state.xId).toBe("p1");
    expect(h.state.turnSeat).toBe("X");
    expect(ticTacToe.currentTurn!(h.state)).toBe("p1");
  });

  it("rejects out-of-turn, occupied, and out-of-range moves", () => {
    const h = game();
    expect(h.send("p2", { cell: 0 })).toBe(false);
    expect(h.send("p1", { cell: 9 })).toBe(false);
    expect(h.send("p1", { cell: -1 })).toBe(false);
    expect(h.send("p1", { cell: 4 })).toBe(true);
    expect(h.send("p2", { cell: 4 })).toBe(false);
  });

  it("alternates turns", () => {
    const h = game();
    h.send("p1", { cell: 0 });
    expect(ticTacToe.currentTurn!(h.state)).toBe("p2");
    h.send("p2", { cell: 1 });
    expect(ticTacToe.currentTurn!(h.state)).toBe("p1");
  });

  it("detects a win for X", () => {
    const h = game();
    h.send("p1", { cell: 0 });
    h.send("p2", { cell: 3 });
    h.send("p1", { cell: 1 });
    h.send("p2", { cell: 4 });
    h.send("p1", { cell: 2 });
    expect(h.result()).toEqual({ placements: [["p1"], ["p2"]] });
    expect(h.send("p2", { cell: 5 })).toBe(false);
  });

  it("detects a win for O on a column", () => {
    const h = game();
    h.send("p1", { cell: 0 });
    h.send("p2", { cell: 2 });
    h.send("p1", { cell: 1 });
    h.send("p2", { cell: 5 });
    h.send("p1", { cell: 4 });
    h.send("p2", { cell: 8 });
    expect(h.result()).toEqual({ placements: [["p2"], ["p1"]] });
  });

  it("detects every winning line", () => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const line of lines) {
      const board = Array<Cell>(9).fill(null);
      for (const i of line) board[i] = "X";
      const info = winnerInfo(board);
      expect(info).toEqual({ seat: "X", line });
    }
  });

  it("ends in a draw on a full board with no winner", () => {
    const h = game();
    // X O X / X O O / O X X — no line for either seat
    const moves: Array<[string, number]> = [
      ["p1", 0], ["p2", 1], ["p1", 2],
      ["p2", 4], ["p1", 3], ["p2", 5],
      ["p1", 7], ["p2", 6], ["p1", 8],
    ];
    for (const [p, cell] of moves) expect(h.send(p, { cell })).toBe(true);
    expect(h.result()).toEqual({ placements: [["p1", "p2"]], draw: true });
  });
});
