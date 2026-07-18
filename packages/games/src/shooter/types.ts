/**
 * Client-safe shooter types and simulation constants — shared so the client
 * predicts its own movement with the same math the server runs.
 */

export const SHOOTER_WORLD = { width: 900, height: 560 } as const;
export const SHOOTER_PLAYER_SIZE = 26;
export const SHOOTER_SPEED = 260;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_RADIUS = 4;
export const FIRE_COOLDOWN_MS = 220;
export const PROJECTILE_DAMAGE = 25;
export const MAX_HP = 100;
export const RESPAWN_MS = 2500;
export const SPAWN_INVULN_MS = 1500;
export const TARGET_KILLS = 10;
export const SHOOTER_DURATION_MS = 180_000;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cover blocks — block both movement and projectiles. */
export const OBSTACLES: Rect[] = [
  { x: 190, y: 120, w: 40, h: 150 },
  { x: 670, y: 290, w: 40, h: 150 },
  { x: 400, y: 60, w: 100, h: 40 },
  { x: 400, y: 460, w: 100, h: 40 },
  { x: 410, y: 240, w: 80, h: 80 },
];

export const SPAWN_POINTS: Array<{ x: number; y: number }> = [
  { x: 60, y: 60 },
  { x: SHOOTER_WORLD.width - 60, y: 60 },
  { x: 60, y: SHOOTER_WORLD.height - 60 },
  { x: SHOOTER_WORLD.width - 60, y: SHOOTER_WORLD.height - 60 },
  { x: SHOOTER_WORLD.width / 2, y: 30 },
  { x: SHOOTER_WORLD.width / 2, y: SHOOTER_WORLD.height - 30 },
];

export interface ShooterIntent {
  seq: number;
  /** Held movement direction, each in [-1, 1]. */
  dx: number;
  dy: number;
  /** Aim direction (unnormalized ok), each in [-1, 1]. */
  ax: number;
  ay: number;
  fire: boolean;
}

export interface ShooterPlayerPub {
  sessionId: string;
  x: number;
  y: number;
  /** Aim unit vector for rendering the turret. */
  ax: number;
  ay: number;
  hp: number;
  alive: boolean;
  respawnAt: number | null;
  invulnUntil: number;
  kills: number;
  deaths: number;
  lastSeq: number;
}

export interface ProjectilePub {
  id: number;
  x: number;
  y: number;
  /** Velocity, for client-side extrapolation between snapshots. */
  vx: number;
  vy: number;
  ownerId: string;
}

export interface KillEvent {
  killerId: string;
  victimId: string;
  at: number;
}

export interface ShooterView {
  players: ShooterPlayerPub[];
  projectiles: ProjectilePub[];
  feed: KillEvent[];
  endsAt: number;
  ended: boolean;
  targetKills: number;
}

export function rectContains(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/**
 * Move with world-bounds clamping and axis-separated obstacle collision —
 * identical on server and predicting client.
 */
export function shooterMove(
  pos: { x: number; y: number },
  dir: { dx: number; dy: number },
  dtMs: number,
): { x: number; y: number } {
  const len = Math.hypot(dir.dx, dir.dy);
  if (len === 0) return pos;
  const half = SHOOTER_PLAYER_SIZE / 2;
  const dist = SHOOTER_SPEED * (dtMs / 1000);
  const clampX = (x: number) => Math.min(SHOOTER_WORLD.width - half, Math.max(half, x));
  const clampY = (y: number) => Math.min(SHOOTER_WORLD.height - half, Math.max(half, y));

  let nx = clampX(pos.x + (dir.dx / len) * dist);
  if (OBSTACLES.some((o) => rectContains(o, nx, pos.y, half))) nx = pos.x;
  let ny = clampY(pos.y + (dir.dy / len) * dist);
  if (OBSTACLES.some((o) => rectContains(o, nx, ny, half))) ny = pos.y;
  return { x: nx, y: ny };
}
