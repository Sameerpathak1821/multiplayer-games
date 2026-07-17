import type { GameDefinition, GameResult, GameSettings, Player } from "./index";

/**
 * Headless test harness: drives a GameDefinition exactly like the server room
 * will, so game logic can be fully unit-tested without any networking.
 */
export interface Harness<S, I> {
  state: S;
  /** Send an intent as a player. Returns false (and leaves state untouched) if invalid. */
  send(playerId: string, intent: I): boolean;
  /** Advance a tick-mode game. Throws for turn-mode games. */
  tick(dtMs?: number): void;
  view(viewerId: string | null): unknown;
  result(): GameResult | null;
}

export function createHarness<S, I>(
  def: GameDefinition<S, I>,
  players: Player[],
  settings: GameSettings = {},
): Harness<S, I> {
  if (players.length < def.minPlayers || players.length > def.maxPlayers) {
    throw new Error(
      `${def.key} needs ${def.minPlayers}-${def.maxPlayers} players, got ${players.length}`,
    );
  }

  let state = def.init(players, settings);

  return {
    get state() {
      return state;
    },
    send(playerId, intent) {
      if (this.result() !== null) return false;
      if (!def.validate(state, playerId, intent)) return false;
      state = def.apply(state, playerId, intent);
      return true;
    },
    tick(dtMs = 50) {
      if (!def.tick) throw new Error(`${def.key} is not a tick-mode game`);
      state = def.tick(state, dtMs);
    },
    view(viewerId) {
      return def.visibleStateFor(state, viewerId);
    },
    result() {
      return def.isOver(state);
    },
  };
}

export function makeTestPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    avatarColor: "#22d3ee",
  }));
}
