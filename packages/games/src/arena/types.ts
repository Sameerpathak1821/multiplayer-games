/**
 * Client-safe arena types and simulation constants. The client uses the SAME
 * constants to predict its own movement, so server and client integrate
 * identically.
 */

export const ARENA_WORLD = { width: 800, height: 480 } as const;
export const PLAYER_SIZE = 28;
export const PLAYER_SPEED = 240; // units per second
export const ORB_RADIUS = 10;
export const ORB_TARGET = 10;
export const ARENA_DURATION_MS = 120_000;
export const ARENA_TICK_MS = 50; // 20 Hz

export interface ArenaOrb {
  id: number;
  x: number;
  y: number;
}

export interface ArenaPlayerPub {
  sessionId: string;
  x: number;
  y: number;
  score: number;
  /** Highest input sequence number the server has processed for this player. */
  lastSeq: number;
}

export interface ArenaView {
  players: ArenaPlayerPub[];
  orbs: ArenaOrb[];
  endsAt: number;
  ended: boolean;
  targetScore: number;
}

export interface ArenaIntent {
  seq: number;
  dx: number;
  dy: number;
}

/** Advance one entity position by a held input direction — shared math. */
export function integrateMove(
  pos: { x: number; y: number },
  dir: { dx: number; dy: number },
  dtMs: number,
): { x: number; y: number } {
  const len = Math.hypot(dir.dx, dir.dy);
  if (len === 0) return pos;
  const nx = dir.dx / len;
  const ny = dir.dy / len;
  const dist = PLAYER_SPEED * (dtMs / 1000);
  const half = PLAYER_SIZE / 2;
  return {
    x: Math.min(ARENA_WORLD.width - half, Math.max(half, pos.x + nx * dist)),
    y: Math.min(ARENA_WORLD.height - half, Math.max(half, pos.y + ny * dist)),
  };
}
