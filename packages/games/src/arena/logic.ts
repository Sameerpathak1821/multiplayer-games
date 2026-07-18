import type { GameDefinition, GameResult, Player } from "@gamehub/game-sdk";
import {
  ARENA_DURATION_MS,
  ARENA_WORLD,
  ORB_RADIUS,
  ORB_TARGET,
  PLAYER_SIZE,
  integrateMove,
  type ArenaIntent,
  type ArenaOrb,
  type ArenaView,
} from "./types";

interface ArenaPlayer {
  x: number;
  y: number;
  dx: number;
  dy: number;
  score: number;
  lastSeq: number;
}

export interface ArenaState {
  players: Record<string, ArenaPlayer>;
  orbs: ArenaOrb[];
  endsAt: number;
  ended: boolean;
  nextOrbId: number;
}

const ORB_COUNT = 3;

function randomOrb(id: number): ArenaOrb {
  const margin = 40;
  return {
    id,
    x: margin + Math.random() * (ARENA_WORLD.width - margin * 2),
    y: margin + Math.random() * (ARENA_WORLD.height - margin * 2),
  };
}

function rankByScore(players: Record<string, ArenaPlayer>): string[][] {
  const sorted = Object.keys(players).sort((a, b) => players[b]!.score - players[a]!.score);
  const groups: string[][] = [];
  for (const id of sorted) {
    const prev = groups.at(-1);
    if (prev && players[prev[0]!]!.score === players[id]!.score) prev.push(id);
    else groups.push([id]);
  }
  return groups;
}

/**
 * Orb Arena — the tick-mode reference game. Deliberately minimal: hold a
 * direction, grab orbs, first to 10 wins. Exists to prove the 20 Hz netcode
 * (prediction, reconciliation, interpolation) that the shooter builds on.
 */
export const arena: GameDefinition<ArenaState, ArenaIntent> = {
  key: "arena",
  displayName: "Orb Arena",
  minPlayers: 1,
  maxPlayers: 8,
  mode: "tick",
  durationMs: ARENA_DURATION_MS,

  init(players: Player[], settings): ArenaState {
    const durationMs =
      typeof settings.durationMs === "number" ? settings.durationMs : ARENA_DURATION_MS;
    const spacing = ARENA_WORLD.width / (players.length + 1);
    return {
      players: Object.fromEntries(
        players.map((p, i) => [
          p.id,
          {
            x: spacing * (i + 1),
            y: ARENA_WORLD.height / 2,
            dx: 0,
            dy: 0,
            score: 0,
            lastSeq: 0,
          },
        ]),
      ),
      orbs: Array.from({ length: ORB_COUNT }, (_, i) => randomOrb(i)),
      endsAt: Date.now() + durationMs,
      ended: false,
      nextOrbId: ORB_COUNT,
    };
  },

  validate(state, playerId, intent) {
    if (state.ended || !state.players[playerId]) return false;
    if (typeof intent !== "object" || intent === null) return false;
    const { seq, dx, dy } = intent as ArenaIntent;
    return (
      Number.isFinite(seq) &&
      seq >= 0 &&
      Number.isFinite(dx) &&
      Number.isFinite(dy) &&
      Math.abs(dx) <= 1 &&
      Math.abs(dy) <= 1
    );
  },

  /** Inputs just set the held direction; movement happens in tick(). */
  apply(state, playerId, intent) {
    const p = state.players[playerId]!;
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...p, dx: intent.dx, dy: intent.dy, lastSeq: Math.max(p.lastSeq, intent.seq) },
      },
    };
  },

  tick(state, dtMs) {
    if (state.ended) return state;
    const players: Record<string, ArenaPlayer> = {};
    for (const [id, p] of Object.entries(state.players)) {
      const pos = integrateMove(p, p, dtMs);
      players[id] = { ...p, x: pos.x, y: pos.y };
    }

    let orbs = state.orbs;
    let nextOrbId = state.nextOrbId;
    let ended: boolean = state.ended;
    for (const orb of state.orbs) {
      const grabber = Object.entries(players).find(
        ([, p]) => Math.hypot(p.x - orb.x, p.y - orb.y) < ORB_RADIUS + PLAYER_SIZE / 2,
      );
      if (grabber) {
        const [id, p] = grabber;
        players[id] = { ...p, score: p.score + 1 };
        orbs = orbs.filter((o) => o.id !== orb.id).concat(randomOrb(nextOrbId));
        nextOrbId += 1;
        if (players[id]!.score >= ORB_TARGET) ended = true;
      }
    }

    return { ...state, players, orbs, nextOrbId, ended };
  },

  timeUp(state) {
    return { ...state, ended: true };
  },

  visibleStateFor(state): ArenaView {
    return {
      players: Object.entries(state.players).map(([sessionId, p]) => ({
        sessionId,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        score: p.score,
        lastSeq: p.lastSeq,
      })),
      orbs: state.orbs,
      endsAt: state.endsAt,
      ended: state.ended,
      targetScore: ORB_TARGET,
    };
  },

  isOver(state): GameResult | null {
    if (!state.ended) return null;
    return {
      placements: rankByScore(state.players),
      scores: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.score])),
    };
  },
};
