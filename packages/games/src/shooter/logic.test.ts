import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, makeTestPlayers } from "@gamehub/game-sdk";
import { shooter, type ShooterState } from "./logic";
import {
  FIRE_COOLDOWN_MS,
  MAX_HP,
  OBSTACLES,
  PROJECTILE_DAMAGE,
  RESPAWN_MS,
  SPAWN_INVULN_MS,
  TARGET_KILLS,
} from "./types";

describe("blast arena", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  function game() {
    const h = createHarness(shooter, makeTestPlayers(2));
    return h;
  }
  const st = (h: ReturnType<typeof game>) => h.state as ShooterState;

  /** Place both players on a clear horizontal line, aim p1 at p2. */
  function lineUp(h: ReturnType<typeof game>, dist = 200) {
    const s = st(h);
    Object.assign(s.players.p1!, { x: 100, y: 400, invulnUntil: 0 });
    Object.assign(s.players.p2!, { x: 100 + dist, y: 400, invulnUntil: 0 });
  }

  it("obstacles block movement", () => {
    const h = game();
    const s = st(h);
    const o = OBSTACLES[0]!;
    Object.assign(s.players.p1!, { x: o.x - 20, y: o.y + o.h / 2, invulnUntil: 0 });
    h.send("p1", { seq: 1, dx: 1, dy: 0, ax: 1, ay: 0, fire: false });
    for (let i = 0; i < 40; i++) h.tick(50);
    expect(st(h).players.p1!.x).toBeLessThan(o.x);
  });

  it("firing respects the cooldown", () => {
    const h = game();
    lineUp(h, 2000); // far apart so nothing hits
    h.send("p1", { seq: 1, dx: 0, dy: 0, ax: 0, ay: -1, fire: true });
    h.tick(50); // one shot
    h.tick(50); // cooldown not elapsed
    expect(st(h).projectiles.filter((p) => p.ownerId === "p1").length).toBe(1);
    vi.advanceTimersByTime(FIRE_COOLDOWN_MS);
    h.tick(50);
    expect(st(h).projectiles.filter((p) => p.ownerId === "p1").length).toBe(2);
  });

  it("projectiles damage and kill; killer scores; feed records it", () => {
    const h = game();
    lineUp(h);
    h.send("p1", { seq: 1, dx: 0, dy: 0, ax: 1, ay: 0, fire: true });

    // 4 hits at 25 dmg = kill; allow travel time between shots.
    for (let shot = 0; shot < 4; shot++) {
      vi.advanceTimersByTime(FIRE_COOLDOWN_MS);
      for (let i = 0; i < 12; i++) h.tick(50);
      // Re-pin p2 in place (it doesn't move, but respawn logic may run).
      if (shot < 3) {
        expect(st(h).players.p2!.hp).toBe(MAX_HP - PROJECTILE_DAMAGE * (shot + 1));
        Object.assign(st(h).players.p2!, { invulnUntil: 0 });
      }
    }

    const s = st(h);
    expect(s.players.p2!.alive).toBe(false);
    expect(s.players.p1!.kills).toBe(1);
    expect(s.players.p2!.deaths).toBe(1);
    expect(s.feed.at(-1)).toMatchObject({ killerId: "p1", victimId: "p2" });
  });

  it("invulnerable players cannot be hit", () => {
    const h = game();
    lineUp(h);
    st(h).players.p2!.invulnUntil = Date.now() + SPAWN_INVULN_MS;
    h.send("p1", { seq: 1, dx: 0, dy: 0, ax: 1, ay: 0, fire: true });
    for (let i = 0; i < 12; i++) h.tick(50);
    expect(st(h).players.p2!.hp).toBe(MAX_HP);
  });

  it("dead players respawn with full hp and spawn protection", () => {
    const h = game();
    const s = st(h);
    Object.assign(s.players.p2!, { alive: false, respawnAt: Date.now() + RESPAWN_MS, hp: 0, deaths: 1 });
    vi.advanceTimersByTime(RESPAWN_MS + 1);
    h.tick(50);
    const p2 = st(h).players.p2!;
    expect(p2.alive).toBe(true);
    expect(p2.hp).toBe(MAX_HP);
    expect(p2.invulnUntil).toBeGreaterThan(Date.now());
    expect(p2.deaths).toBe(1);
  });

  it("reaching the kill target ends the match ranked by kills", () => {
    const h = game();
    const s = st(h);
    s.players.p1!.kills = TARGET_KILLS - 1;
    lineUp(h);
    h.send("p1", { seq: 1, dx: 0, dy: 0, ax: 1, ay: 0, fire: true });
    st(h).players.p2!.hp = PROJECTILE_DAMAGE; // one hit left
    for (let i = 0; i < 12 && !h.result(); i++) h.tick(50);

    const result = h.result();
    expect(result).not.toBeNull();
    expect(result!.placements[0]).toEqual(["p1"]);
    expect(result!.scores!.p1).toBe(TARGET_KILLS);
  });

  it("time-up ends the game; ties broken by fewer deaths", () => {
    const h = game();
    const s = st(h);
    s.players.p1!.kills = 3;
    s.players.p1!.deaths = 5;
    s.players.p2!.kills = 3;
    s.players.p2!.deaths = 1;
    const result = shooter.isOver(shooter.timeUp!(st(h)));
    expect(result!.placements[0]).toEqual(["p2"]);
  });

  it("rejects malformed input", () => {
    const h = game();
    expect(h.send("p1", { seq: 1, dx: 3, dy: 0, ax: 0, ay: 0, fire: false })).toBe(false);
    const badFire = { seq: 1, dx: 0, dy: 0, ax: 0, ay: 0, fire: "yes" };
    expect(h.send("p1", badFire as unknown as Parameters<typeof h.send>[1])).toBe(false);
    expect(h.send("p1", { seq: -2, dx: 0, dy: 0, ax: 0, ay: 0, fire: false })).toBe(false);
  });
});
