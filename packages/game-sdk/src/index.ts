/**
 * The Game SDK — the contract every game on the platform implements.
 *
 * Games are pure logic: no I/O, no timers, no sockets. The server room drives
 * them (validate → apply → broadcast), and the same code can run on the client
 * for optimistic prediction. Hidden information never leaves the server except
 * through `visibleStateFor`.
 */

export interface Player {
  /** Stable session id — survives reconnects. */
  id: string;
  name: string;
  avatarColor: string;
}

export type GameSettings = Record<string, unknown>;

export interface GameResult {
  /** Player ids in finishing order (winner first). Ties share an index. */
  placements: string[][];
  /** Optional per-player score for the scoreboard. */
  scores?: Record<string, number>;
  /** True when the game ended without a winner (draw, abandoned). */
  draw?: boolean;
}

export interface GameDefinition<S, I> {
  /** Unique key, e.g. "tic-tac-toe". */
  key: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  /** "turn": event-driven. "tick": fixed-rate server simulation. */
  mode: "turn" | "tick";

  /**
   * Turn-based games: whose turn is it (null = nobody / simultaneous phase).
   * The server uses this to run per-turn timers and show turn indicators.
   */
  currentTurn?(state: S): string | null;
  /** If set with currentTurn, the server forfeits players who exceed this budget. */
  turnTimeoutMs?: number;
  /**
   * Timed-round games: the whole game ends this long after start.
   * The server then applies `timeUp` and expects `isOver` to return a result.
   */
  durationMs?: number;
  /** Transition state to "time expired" (e.g. mark the round ended). */
  timeUp?(state: S): S;

  init(players: Player[], settings: GameSettings): S;
  /** May this player apply this intent right now? Pure — no side effects. */
  validate(state: S, playerId: string, intent: I): boolean;
  /** Apply a validated intent. Must return a new state (no mutation). */
  apply(state: S, playerId: string, intent: I): S;
  /** Tick-mode games advance the simulation here (dtMs = fixed step). */
  tick?(state: S, dtMs: number): S;
  /**
   * Project state for one viewer. This is the hidden-information boundary:
   * a player's card hand, the crossword solution, etc. never appear in
   * another viewer's projection. `viewerId` is null for spectators.
   */
  visibleStateFor(state: S, viewerId: string | null): unknown;
  /** Non-null when the game is over. */
  isOver(state: S): GameResult | null;
}

export { createHarness, makeTestPlayers, type Harness } from "./harness";
