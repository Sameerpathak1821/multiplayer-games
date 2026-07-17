import { describe, expect, it } from "vitest";
import type { GameDefinition } from "./index";
import { createHarness, makeTestPlayers } from "./harness";

/** Toy game: players take turns incrementing a counter; first to reach 5 wins. */
interface RaceState {
  order: string[];
  turn: number;
  counts: Record<string, number>;
}
type RaceIntent = { action: "step" };

const raceToFive: GameDefinition<RaceState, RaceIntent> = {
  key: "race-to-five",
  displayName: "Race to Five",
  minPlayers: 2,
  maxPlayers: 4,
  mode: "turn",
  init: (players) => ({
    order: players.map((p) => p.id),
    turn: 0,
    counts: Object.fromEntries(players.map((p) => [p.id, 0])),
  }),
  validate: (state, playerId) => state.order[state.turn % state.order.length] === playerId,
  apply: (state, playerId) => ({
    ...state,
    turn: state.turn + 1,
    counts: { ...state.counts, [playerId]: (state.counts[playerId] ?? 0) + 1 },
  }),
  visibleStateFor: (state) => state,
  isOver: (state) => {
    const winner = Object.entries(state.counts).find(([, c]) => c >= 5);
    if (!winner) return null;
    const losers = state.order.filter((id) => id !== winner[0]);
    return { placements: [[winner[0]], losers] };
  },
};

describe("createHarness", () => {
  it("enforces player count", () => {
    expect(() => createHarness(raceToFive, makeTestPlayers(1))).toThrow();
  });

  it("rejects out-of-turn intents without changing state", () => {
    const h = createHarness(raceToFive, makeTestPlayers(2));
    expect(h.send("p2", { action: "step" })).toBe(false);
    expect(h.state.turn).toBe(0);
  });

  it("plays a full game to a result", () => {
    const h = createHarness(raceToFive, makeTestPlayers(2));
    for (let round = 0; round < 5; round++) {
      expect(h.send("p1", { action: "step" })).toBe(true);
      if (round < 4) expect(h.send("p2", { action: "step" })).toBe(true);
    }
    expect(h.result()).toEqual({ placements: [["p1"], ["p2"]] });
  });

  it("blocks intents after the game is over", () => {
    const h = createHarness(raceToFive, makeTestPlayers(2));
    for (let round = 0; round < 5; round++) {
      h.send("p1", { action: "step" });
      h.send("p2", { action: "step" });
    }
    expect(h.send("p2", { action: "step" })).toBe(false);
  });

  it("throws when ticking a turn-mode game", () => {
    const h = createHarness(raceToFive, makeTestPlayers(2));
    expect(() => h.tick()).toThrow();
  });
});
