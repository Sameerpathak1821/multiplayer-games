import type { GameDefinition, GameResult, Player } from "@gamehub/game-sdk";
import {
  FIRE_COOLDOWN_MS,
  MAX_HP,
  OBSTACLES,
  PROJECTILE_DAMAGE,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  RESPAWN_MS,
  SHOOTER_DURATION_MS,
  SHOOTER_PLAYER_SIZE,
  SHOOTER_WORLD,
  SPAWN_INVULN_MS,
  SPAWN_POINTS,
  TARGET_KILLS,
  rectContains,
  shooterMove,
  type KillEvent,
  type ProjectilePub,
  type ShooterIntent,
  type ShooterView,
} from "./types";

interface ShooterPlayer {
  x: number;
  y: number;
  dx: number;
  dy: number;
  ax: number;
  ay: number;
  fire: boolean;
  hp: number;
  alive: boolean;
  respawnAt: number | null;
  invulnUntil: number;
  lastFireAt: number;
  kills: number;
  deaths: number;
  lastSeq: number;
}

export interface ShooterState {
  players: Record<string, ShooterPlayer>;
  projectiles: ProjectilePub[];
  feed: KillEvent[];
  nextProjectileId: number;
  endsAt: number;
  ended: boolean;
}

const FEED_SIZE = 6;
/** Projectile substeps per tick to prevent tunneling through players/walls. */
const SUBSTEPS = 3;

function spawnPoint(players: Record<string, ShooterPlayer>): { x: number; y: number } {
  // Pick the spawn farthest from living enemies.
  const alive = Object.values(players).filter((p) => p.alive);
  let best = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]!;
  let bestDist = -1;
  for (const s of SPAWN_POINTS) {
    const d = alive.length
      ? Math.min(...alive.map((p) => Math.hypot(p.x - s.x, p.y - s.y)))
      : Math.random() * 1000;
    if (d > bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function freshPlayer(at: { x: number; y: number }, now: number): ShooterPlayer {
  return {
    x: at.x,
    y: at.y,
    dx: 0,
    dy: 0,
    ax: 1,
    ay: 0,
    fire: false,
    hp: MAX_HP,
    alive: true,
    respawnAt: null,
    invulnUntil: now + SPAWN_INVULN_MS,
    lastFireAt: 0,
    kills: 0,
    deaths: 0,
    lastSeq: 0,
  };
}

function rankByKills(players: Record<string, ShooterPlayer>): string[][] {
  const sorted = Object.keys(players).sort((a, b) => {
    const pa = players[a]!;
    const pb = players[b]!;
    if (pb.kills !== pa.kills) return pb.kills - pa.kills;
    return pa.deaths - pb.deaths;
  });
  const groups: string[][] = [];
  for (const id of sorted) {
    const prev = groups.at(-1);
    if (
      prev &&
      players[prev[0]!]!.kills === players[id]!.kills &&
      players[prev[0]!]!.deaths === players[id]!.deaths
    ) {
      prev.push(id);
    } else {
      groups.push([id]);
    }
  }
  return groups;
}

/**
 * Blast Arena — top-down FFA deathmatch on the 20Hz tick engine.
 * Server-authoritative everything: movement, cooldowns, projectiles, damage.
 */
export const shooter: GameDefinition<ShooterState, ShooterIntent> = {
  key: "shooter",
  displayName: "Blast Arena",
  minPlayers: 1,
  maxPlayers: 8,
  mode: "tick",
  durationMs: SHOOTER_DURATION_MS,

  init(players: Player[], settings): ShooterState {
    const now = Date.now();
    const durationMs =
      typeof settings.durationMs === "number" ? settings.durationMs : SHOOTER_DURATION_MS;
    const state: ShooterState = {
      players: {},
      projectiles: [],
      feed: [],
      nextProjectileId: 0,
      endsAt: now + durationMs,
      ended: false,
    };
    players.forEach((p, i) => {
      state.players[p.id] = freshPlayer(SPAWN_POINTS[i % SPAWN_POINTS.length]!, now);
    });
    return state;
  },

  validate(state, playerId, intent) {
    if (state.ended || !state.players[playerId]) return false;
    if (typeof intent !== "object" || intent === null) return false;
    const { seq, dx, dy, ax, ay, fire } = intent as ShooterIntent;
    const inRange = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1;
    return (
      Number.isFinite(seq) && seq >= 0 && inRange(dx) && inRange(dy) && inRange(ax) && inRange(ay) &&
      typeof fire === "boolean"
    );
  },

  apply(state, playerId, intent) {
    const p = state.players[playerId]!;
    return {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...p,
          dx: intent.dx,
          dy: intent.dy,
          ax: intent.ax,
          ay: intent.ay,
          fire: intent.fire,
          lastSeq: Math.max(p.lastSeq, intent.seq),
        },
      },
    };
  },

  tick(state, dtMs) {
    if (state.ended) return state;
    const now = Date.now();
    const players: Record<string, ShooterPlayer> = {};
    for (const [id, p] of Object.entries(state.players)) players[id] = { ...p };

    let projectiles = state.projectiles.map((pr) => ({ ...pr }));
    let feed = state.feed;
    let nextProjectileId = state.nextProjectileId;
    let ended: boolean = state.ended;

    // Respawns + movement + firing.
    for (const [pid, p] of Object.entries(players)) {
      if (!p.alive) {
        if (p.respawnAt !== null && now >= p.respawnAt) {
          const s = spawnPoint(players);
          Object.assign(p, freshPlayer(s, now), {
            kills: p.kills,
            deaths: p.deaths,
            lastSeq: p.lastSeq,
          });
        }
        continue;
      }
      const pos = shooterMove(p, p, dtMs);
      p.x = pos.x;
      p.y = pos.y;

      const aimLen = Math.hypot(p.ax, p.ay);
      if (p.fire && aimLen > 0.2 && now - p.lastFireAt >= FIRE_COOLDOWN_MS) {
        p.lastFireAt = now;
        const nx = p.ax / aimLen;
        const ny = p.ay / aimLen;
        const muzzle = SHOOTER_PLAYER_SIZE / 2 + PROJECTILE_RADIUS + 2;
        projectiles.push({
          id: nextProjectileId++,
          x: p.x + nx * muzzle,
          y: p.y + ny * muzzle,
          vx: nx * PROJECTILE_SPEED,
          vy: ny * PROJECTILE_SPEED,
          ownerId: pid,
        });
      }
    }

    // Projectiles: substepped advance, wall/obstacle/player hits.
    const stepMs = dtMs / SUBSTEPS;
    const survivors: ProjectilePub[] = [];
    for (const pr of projectiles) {
      let dead = false;
      for (let s = 0; s < SUBSTEPS && !dead; s++) {
        pr.x += pr.vx * (stepMs / 1000);
        pr.y += pr.vy * (stepMs / 1000);

        if (
          pr.x < 0 || pr.x > SHOOTER_WORLD.width || pr.y < 0 || pr.y > SHOOTER_WORLD.height ||
          OBSTACLES.some((o) => rectContains(o, pr.x, pr.y, PROJECTILE_RADIUS))
        ) {
          dead = true;
          break;
        }

        for (const [id, target] of Object.entries(players)) {
          if (id === pr.ownerId || !target.alive || now < target.invulnUntil) continue;
          const hitR = PROJECTILE_RADIUS + SHOOTER_PLAYER_SIZE / 2;
          if (Math.hypot(target.x - pr.x, target.y - pr.y) < hitR) {
            target.hp -= PROJECTILE_DAMAGE;
            dead = true;
            if (target.hp <= 0) {
              target.alive = false;
              target.respawnAt = now + RESPAWN_MS;
              target.deaths += 1;
              const killer = players[pr.ownerId];
              if (killer) {
                killer.kills += 1;
                if (killer.kills >= TARGET_KILLS) ended = true;
              }
              feed = [...feed.slice(-(FEED_SIZE - 1)), { killerId: pr.ownerId, victimId: id, at: now }];
            }
            break;
          }
        }
      }
      if (!dead) survivors.push(pr);
    }

    return { ...state, players, projectiles: survivors, feed, nextProjectileId, ended };
  },

  timeUp(state) {
    return { ...state, ended: true };
  },

  visibleStateFor(state): ShooterView {
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      players: Object.entries(state.players).map(([sessionId, p]) => {
        const aimLen = Math.hypot(p.ax, p.ay) || 1;
        return {
          sessionId,
          x: round(p.x),
          y: round(p.y),
          ax: round(p.ax / aimLen),
          ay: round(p.ay / aimLen),
          hp: p.hp,
          alive: p.alive,
          respawnAt: p.respawnAt,
          invulnUntil: p.invulnUntil,
          kills: p.kills,
          deaths: p.deaths,
          lastSeq: p.lastSeq,
        };
      }),
      projectiles: state.projectiles.map((pr) => ({
        ...pr,
        x: round(pr.x),
        y: round(pr.y),
      })),
      feed: state.feed,
      endsAt: state.endsAt,
      ended: state.ended,
      targetKills: TARGET_KILLS,
    };
  },

  isOver(state): GameResult | null {
    if (!state.ended) return null;
    return {
      placements: rankByKills(state.players),
      scores: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.kills])),
    };
  },
};
