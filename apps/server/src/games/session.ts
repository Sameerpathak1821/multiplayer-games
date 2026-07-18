/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameDefinition, GameResult, Player } from "@gamehub/game-sdk";
import type { TurnInfo } from "@gamehub/shared";

/** Fixed simulation step for tick-mode games (20 Hz). */
export const TICK_MS = 50;

import type { GameSettings } from "@gamehub/game-sdk";

export interface GameSessionOptions {
  /** Override the game's own per-turn budget (tests use short values). */
  turnTimeoutMs?: number;
  /** Override the game's total duration (tests use short values). */
  durationMs?: number;
  /** Passed through to the game's init. */
  settings?: GameSettings;
  /** Called whenever state changed and views should be re-broadcast. */
  onState: () => void;
  /** Called exactly once when the game ends. */
  onOver: (result: GameResult, forfeitSessionId?: string) => void;
}

/**
 * Drives one GameDefinition on the server: applies validated intents,
 * runs the per-turn forfeit timer, and projects per-viewer state.
 * Pure game logic stays in the definition; all I/O and time lives here.
 */
export class GameSession {
  turn: TurnInfo = null;
  private state: any;
  private over = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private gameTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private def: GameDefinition<any, any>,
    readonly players: Player[],
    private opts: GameSessionOptions,
  ) {
    this.state = def.init(players, opts.settings ?? {});
    this.armTurnTimer();

    // Tick-mode games: fixed-rate simulation loop. Inputs are applied the
    // moment they arrive (they only set held state); the loop advances the
    // world and broadcasts one snapshot per tick.
    if (def.mode === "tick" && def.tick) {
      this.tickTimer = setInterval(() => this.runTick(), TICK_MS);
    }

    // Timed-round games end no matter what once the clock runs out.
    const durationMs = def.durationMs ? (opts.durationMs ?? def.durationMs) : undefined;
    if (durationMs) {
      this.gameTimer = setTimeout(() => this.handleTimeUp(), durationMs);
    }
  }

  private runTick(): void {
    if (this.over) return;
    this.state = this.def.tick!(this.state, TICK_MS);
    const result = this.def.isOver(this.state);
    if (result) {
      this.finish(result);
    } else {
      this.opts.onState();
    }
  }

  private handleTimeUp(): void {
    if (this.over) return;
    if (this.def.timeUp) this.state = this.def.timeUp(this.state);
    const result = this.def.isOver(this.state);
    if (result) this.finish(result);
  }

  isPlayer(sessionId: string): boolean {
    return this.players.some((p) => p.id === sessionId);
  }

  applyIntent(sessionId: string, intent: unknown): boolean {
    if (this.over || !this.isPlayer(sessionId)) return false;
    if (!this.def.validate(this.state, sessionId, intent)) return false;

    this.state = this.def.apply(this.state, sessionId, intent);

    // Tick mode: intents only mutate held inputs — the loop broadcasts.
    if (this.tickTimer) return true;

    const result = this.def.isOver(this.state);
    if (result) {
      this.finish(result);
    } else {
      this.armTurnTimer();
      this.opts.onState();
    }
    return true;
  }

  /** Player abandoned (left the room or timed out) — everyone else wins. */
  forfeit(sessionId: string): void {
    if (this.over || !this.isPlayer(sessionId)) return;
    const others = this.players.filter((p) => p.id !== sessionId).map((p) => p.id);
    this.finish({ placements: [others, [sessionId]] }, sessionId);
  }

  viewFor(viewerId: string | null): unknown {
    return this.def.visibleStateFor(this.state, viewerId);
  }

  destroy(): void {
    this.over = true;
    this.clearTurnTimer();
    if (this.gameTimer) clearTimeout(this.gameTimer);
    this.gameTimer = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private finish(result: GameResult, forfeitSessionId?: string): void {
    this.over = true;
    this.clearTurnTimer();
    if (this.gameTimer) clearTimeout(this.gameTimer);
    this.gameTimer = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.turn = null;
    this.opts.onState(); // final board reaches everyone before the result
    this.opts.onOver(result, forfeitSessionId);
  }

  private armTurnTimer(): void {
    this.clearTurnTimer();
    const timeoutMs = this.opts.turnTimeoutMs ?? this.def.turnTimeoutMs;
    const current = this.def.currentTurn?.(this.state) ?? null;
    if (!current || !timeoutMs) {
      this.turn = null;
      return;
    }
    this.turn = { sessionId: current, deadline: Date.now() + timeoutMs };
    this.turnTimer = setTimeout(() => this.forfeit(current), timeoutMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }
}
