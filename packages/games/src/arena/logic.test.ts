import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, makeTestPlayers } from "@gamehub/game-sdk";
import { arena, type ArenaState } from "./logic";
import { ARENA_WORLD, PLAYER_SIZE, PLAYER_SPEED } from "./types";

describe("orb arena", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  function game() {
    return createHarness(arena, makeTestPlayers(2));
  }

  it("holding a direction moves the player at the fixed speed", () => {
    const h = game();
    const before = (h.state as ArenaState).players.p1!;
    expect(h.send("p1", { seq: 1, dx: 1, dy: 0 })).toBe(true);
    h.tick(1000);
    const after = (h.state as ArenaState).players.p1!;
    expect(after.x - before.x).toBeCloseTo(PLAYER_SPEED, 0);
    expect(after.y).toBe(before.y);
    expect(after.lastSeq).toBe(1);
  });

  it("diagonal movement is normalized (no speed advantage)", () => {
    const h = game();
    const before = (h.state as ArenaState).players.p1!;
    h.send("p1", { seq: 1, dx: 1, dy: 1 });
    h.tick(1000);
    const after = (h.state as ArenaState).players.p1!;
    const dist = Math.hypot(after.x - before.x, after.y - before.y);
    expect(dist).toBeCloseTo(PLAYER_SPEED, 0);
  });

  it("players are clamped inside the world bounds", () => {
    const h = game();
    h.send("p1", { seq: 1, dx: -1, dy: -1 });
    for (let i = 0; i < 100; i++) h.tick(100);
    const p = (h.state as ArenaState).players.p1!;
    expect(p.x).toBe(PLAYER_SIZE / 2);
    expect(p.y).toBe(PLAYER_SIZE / 2);
    expect(p.x).toBeGreaterThan(0);
  });

  it("rejects malformed inputs", () => {
    const h = game();
    expect(h.send("p1", { seq: -1, dx: 0, dy: 0 })).toBe(false);
    expect(h.send("p1", { seq: 1, dx: 5, dy: 0 })).toBe(false);
    expect(h.send("p1", { seq: 1, dx: Number.NaN, dy: 0 })).toBe(false);
  });

  it("touching an orb scores it and respawns a new one", () => {
    const h = game();
    const state = h.state as ArenaState;
    // Teleport-by-test: place an orb exactly on p1.
    const p1 = state.players.p1!;
    state.orbs[0] = { id: 999, x: p1.x, y: p1.y };
    h.tick(50);
    const after = h.state as ArenaState;
    expect(after.players.p1!.score).toBe(1);
    expect(after.orbs).toHaveLength(3);
    expect(after.orbs.find((o) => o.id === 999)).toBeUndefined();
  });

  it("time-up ends the game ranked by score", () => {
    const h = game();
    const state = h.state as ArenaState;
    state.players.p2!.score = 4;
    const ended = arena.timeUp!(h.state as ArenaState);
    const result = arena.isOver(ended);
    expect(result!.placements[0]).toEqual(["p2"]);
    expect(result!.scores).toEqual({ p1: 0, p2: 4 });
  });

  it("view exposes positions, scores and lastSeq for reconciliation", () => {
    const h = game();
    h.send("p1", { seq: 7, dx: 0, dy: 1 });
    h.tick(50);
    const view = h.view("p1") as { players: Array<{ sessionId: string; lastSeq: number }> };
    expect(view.players.find((p) => p.sessionId === "p1")!.lastSeq).toBe(7);
  });
});
