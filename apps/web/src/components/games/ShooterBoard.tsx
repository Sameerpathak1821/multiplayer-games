import { useEffect, useRef, useState } from "react";
import {
  MAX_HP,
  OBSTACLES,
  PROJECTILE_RADIUS,
  SHOOTER_PLAYER_SIZE,
  SHOOTER_WORLD,
  shooterMove,
  type ShooterView,
} from "@gamehub/games/client";
import type { GameStateMsg } from "../../lib/room";
import { isCoarsePointer } from "../../lib/quality";

interface Props {
  game: GameStateMsg;
  you: string | null;
  finished: boolean;
  ping: number | null;
  onMove(payload: unknown): void;
}

const INTERP_DELAY_MS = 120;
const RECONCILE_RATE = 8;
/** Input packets go out at this rate while anything is active. */
const INPUT_SEND_MS = 80;

interface Snapshot {
  at: number;
  view: ShooterView;
}

interface Stick {
  id: number;
  baseX: number;
  baseY: number;
  dx: number;
  dy: number;
}

export default function ShooterBoard({ game, you, finished, ping, onMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  // Keep the latest onMove without re-running the input effect (the
  // component re-renders at snapshot rate; recreating the send interval
  // every render would starve it).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const snapshotsRef = useRef<Snapshot[]>([]);
  const myPosRef = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef({ dx: 0, dy: 0, ax: 1, ay: 0, fire: false });
  const seqRef = useRef(0);
  const heldRef = useRef(new Set<string>());
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const sticksRef = useRef<{ move: Stick | null; aim: Stick | null }>({ move: null, aim: null });
  const viewTransformRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const [, forceHud] = useState(0);

  useEffect(() => {
    const buf = snapshotsRef.current;
    buf.push({ at: Date.now(), view: game.view as ShooterView });
    if (buf.length > 30) buf.splice(0, buf.length - 30);
    forceHud((n) => n + 1);
  }, [game]);

  // Input: keyboard move, mouse aim/fire, touch dual-sticks; fixed-rate sender.
  useEffect(() => {
    if (finished || !you) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const KEYS: Record<string, [number, number]> = {
      w: [0, -1], arrowup: [0, -1],
      s: [0, 1], arrowdown: [0, 1],
      a: [-1, 0], arrowleft: [-1, 0],
      d: [1, 0], arrowright: [1, 0],
    };

    function refreshKeyboardDir() {
      let dx = 0;
      let dy = 0;
      for (const k of heldRef.current) {
        const v = KEYS[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      inputRef.current.dx = Math.max(-1, Math.min(1, dx));
      inputRef.current.dy = Math.max(-1, Math.min(1, dy));
    }

    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (!(k in KEYS)) return;
      e.preventDefault();
      if (e.type === "keydown") heldRef.current.add(k);
      else heldRef.current.delete(k);
      refreshKeyboardDir();
    }

    function toWorld(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const { scale, ox, oy } = viewTransformRef.current;
      return {
        x: ((clientX - rect.left) * devicePixelRatio - ox) / scale,
        y: ((clientY - rect.top) * devicePixelRatio - oy) / scale,
      };
    }

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = toWorld(e.clientX, e.clientY);
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button === 0) {
        inputRef.current.fire = true;
        sendInput(true);
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) {
        inputRef.current.fire = false;
        sendInput(true);
      }
    }

    // Touch: left half = move stick, right half = aim + fire stick.
    let fireLatch: ReturnType<typeof setTimeout> | null = null;
    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      for (const t of Array.from(e.changedTouches)) {
        const isLeft = t.clientX - rect.left < rect.width / 2;
        const stick: Stick = { id: t.identifier, baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 };
        if (isLeft && !sticksRef.current.move) sticksRef.current.move = stick;
        else if (!isLeft && !sticksRef.current.aim) {
          sticksRef.current.aim = stick;
          if (fireLatch) clearTimeout(fireLatch);
          inputRef.current.fire = true;
          sendInput(true); // fire the moment the thumb lands
        }
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        for (const key of ["move", "aim"] as const) {
          const s = sticksRef.current[key];
          if (s && s.id === t.identifier) {
            const dx = (t.clientX - s.baseX) / 40;
            const dy = (t.clientY - s.baseY) / 40;
            const len = Math.hypot(dx, dy);
            s.dx = len > 1 ? dx / len : dx;
            s.dy = len > 1 ? dy / len : dy;
            if (key === "move") {
              inputRef.current.dx = s.dx;
              inputRef.current.dy = s.dy;
            } else if (len > 0.25) {
              inputRef.current.ax = s.dx / (len || 1);
              inputRef.current.ay = s.dy / (len || 1);
            }
          }
        }
      }
    }
    function onTouchEnd(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) {
        if (sticksRef.current.move?.id === t.identifier) {
          sticksRef.current.move = null;
          inputRef.current.dx = 0;
          inputRef.current.dy = 0;
          sendInput(true);
        }
        if (sticksRef.current.aim?.id === t.identifier) {
          sticksRef.current.aim = null;
          // Latch fire briefly so even the quickest tap gets a shot off.
          if (fireLatch) clearTimeout(fireLatch);
          fireLatch = setTimeout(() => {
            inputRef.current.fire = false;
            sendInput(true);
          }, 160);
        }
      }
    }

    // Input sender: fixed-rate while anything is active, plus immediate
    // sends on fire/stop events (so quick taps never miss the window).
    // Mouse aim only applies on fine pointers — phones must not have a
    // stale synthetic mouse position hijacking the aim stick.
    const coarse = isCoarsePointer();
    let lastSent = "";
    function sendInput(force = false) {
      const inp = inputRef.current;
      if (!coarse && mouseRef.current && myPosRef.current) {
        const ax = mouseRef.current.x - myPosRef.current.x;
        const ay = mouseRef.current.y - myPosRef.current.y;
        const len = Math.hypot(ax, ay) || 1;
        inp.ax = ax / len;
        inp.ay = ay / len;
      }
      const payload = {
        dx: inp.dx,
        dy: inp.dy,
        ax: Math.round(inp.ax * 100) / 100,
        ay: Math.round(inp.ay * 100) / 100,
        fire: inp.fire,
      };
      const sig = JSON.stringify(payload);
      const active = inp.fire || inp.dx !== 0 || inp.dy !== 0;
      if (force || sig !== lastSent || active) {
        lastSent = sig;
        seqRef.current += 1;
        onMoveRef.current({ seq: seqRef.current, ...payload });
      }
    }
    const sender = setInterval(sendInput, INPUT_SEND_MS);

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    return () => {
      clearInterval(sender);
      if (fireLatch) clearTimeout(fireLatch);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
    // onMove intentionally excluded — accessed via onMoveRef.
  }, [finished, you]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    function draw(now: number) {
      const dt = Math.min(100, now - last);
      last = now;
      const buf = snapshotsRef.current;
      const latest = buf.at(-1);
      if (!latest) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const view = latest.view;

      // Self prediction + reconciliation.
      const serverMe = you ? view.players.find((p) => p.sessionId === you) : undefined;
      if (serverMe?.alive) {
        if (!myPosRef.current) myPosRef.current = { x: serverMe.x, y: serverMe.y };
        myPosRef.current = shooterMove(myPosRef.current, inputRef.current, dt);
        const k = 1 - Math.exp((-RECONCILE_RATE * dt) / 1000);
        myPosRef.current.x += (serverMe.x - myPosRef.current.x) * k;
        myPosRef.current.y += (serverMe.y - myPosRef.current.y) * k;
      } else if (serverMe) {
        myPosRef.current = { x: serverMe.x, y: serverMe.y };
      }

      // Interp pair for others.
      const renderTime = Date.now() - INTERP_DELAY_MS;
      let older = buf[0];
      let newer = buf.at(-1);
      for (let i = buf.length - 1; i > 0; i--) {
        if (buf[i - 1]!.at <= renderTime) {
          older = buf[i - 1];
          newer = buf[i];
          break;
        }
      }
      const span = newer && older ? newer.at - older.at : 0;
      const alpha = span > 0 ? Math.min(1, Math.max(0, (renderTime - older!.at) / span)) : 1;

      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const scale = Math.min(w / SHOOTER_WORLD.width, h / SHOOTER_WORLD.height);
      const ox = (w - SHOOTER_WORLD.width * scale) / 2;
      const oy = (h - SHOOTER_WORLD.height * scale) / 2;
      viewTransformRef.current = { scale, ox, oy };
      const X = (x: number) => ox + x * scale;
      const Y = (y: number) => oy + y * scale;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0e1320";
      ctx.fillRect(ox, oy, SHOOTER_WORLD.width * scale, SHOOTER_WORLD.height * scale);
      ctx.strokeStyle = "rgba(35,44,63,0.5)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= SHOOTER_WORLD.width; gx += 90) {
        ctx.beginPath();
        ctx.moveTo(X(gx), oy);
        ctx.lineTo(X(gx), Y(SHOOTER_WORLD.height));
        ctx.stroke();
      }
      for (let gy = 0; gy <= SHOOTER_WORLD.height; gy += 90) {
        ctx.beginPath();
        ctx.moveTo(ox, Y(gy));
        ctx.lineTo(X(SHOOTER_WORLD.width), Y(gy));
        ctx.stroke();
      }

      // Obstacles.
      for (const o of OBSTACLES) {
        ctx.fillStyle = "#1a2130";
        ctx.strokeStyle = "rgba(34,211,238,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(X(o.x), Y(o.y), o.w * scale, o.h * scale, 4 * scale);
        ctx.fill();
        ctx.stroke();
      }

      // Projectiles (extrapolated from the latest snapshot).
      const age = (Date.now() - latest.at) / 1000;
      for (const pr of view.projectiles) {
        const px = pr.x + pr.vx * age;
        const py = pr.y + pr.vy * age;
        const owner = gameRef.current.players.find((m) => m.sessionId === pr.ownerId);
        const color = owner?.avatarColor ?? "#22d3ee";
        const r = PROJECTILE_RADIUS * scale;
        const g = ctx.createRadialGradient(X(px), Y(py), 0, X(px), Y(py), r * 3);
        g.addColorStop(0, color);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(X(px), Y(py), r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(X(px), Y(py), r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Players.
      const size = SHOOTER_PLAYER_SIZE * scale;
      const nowMs = Date.now();
      for (const p of view.players) {
        if (!p.alive) continue;
        let px = p.x;
        let py = p.y;
        if (p.sessionId === you && myPosRef.current) {
          px = myPosRef.current.x;
          py = myPosRef.current.y;
        } else if (older && newer) {
          const a = older.view.players.find((q) => q.sessionId === p.sessionId);
          const b = newer.view.players.find((q) => q.sessionId === p.sessionId);
          if (a && b && a.alive && b.alive) {
            px = a.x + (b.x - a.x) * alpha;
            py = a.y + (b.y - a.y) * alpha;
          }
        }
        const meta = gameRef.current.players.find((m) => m.sessionId === p.sessionId);
        const color = meta?.avatarColor ?? "#22d3ee";
        const invuln = nowMs < p.invulnUntil;

        ctx.globalAlpha = invuln ? 0.55 + 0.35 * Math.sin(nowMs / 90) : 1;
        // Aim turret.
        let aimX = p.ax;
        let aimY = p.ay;
        if (p.sessionId === you) {
          aimX = inputRef.current.ax;
          aimY = inputRef.current.ay;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.moveTo(X(px), Y(py));
        ctx.lineTo(X(px + aimX * (SHOOTER_PLAYER_SIZE * 0.9)), Y(py + aimY * (SHOOTER_PLAYER_SIZE * 0.9)));
        ctx.stroke();
        // Body.
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(X(px) - size / 2, Y(py) - size / 2, size, size, 6 * scale);
        ctx.fill();
        if (p.sessionId === you) {
          ctx.strokeStyle = "#e8ecf4";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // HP bar + name.
        const bw = size * 1.2;
        ctx.fillStyle = "rgba(11,14,20,0.7)";
        ctx.fillRect(X(px) - bw / 2, Y(py) - size / 2 - 10 * scale, bw, 4 * scale);
        ctx.fillStyle = p.hp > 50 ? "#34d399" : p.hp > 25 ? "#fbbf24" : "#fb7185";
        ctx.fillRect(X(px) - bw / 2, Y(py) - size / 2 - 10 * scale, (bw * p.hp) / MAX_HP, 4 * scale);
        ctx.fillStyle = "#e8ecf4";
        ctx.font = `${Math.max(9, 10 * scale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.sessionId === you ? "you" : (meta?.name ?? ""), X(px), Y(py) - size / 2 - 14 * scale);
      }

      // Resting thumb-zone hints so touch players can find the controls.
      if (isCoarsePointer() && you && serverMe?.alive) {
        const zones = [
          { active: sticksRef.current.move, x: w * 0.16, label: "MOVE" },
          { active: sticksRef.current.aim, x: w * 0.84, label: "AIM · FIRE" },
        ];
        const zy = h - 64 * devicePixelRatio;
        for (const z of zones) {
          if (z.active) continue;
          ctx.strokeStyle = "rgba(232,236,244,0.22)";
          ctx.setLineDash([6 * devicePixelRatio, 6 * devicePixelRatio]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, zy, 34 * devicePixelRatio, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(232,236,244,0.4)";
          ctx.font = `${10 * devicePixelRatio}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(z.label, z.x, zy + 52 * devicePixelRatio);
        }
      }

      // Touch stick overlays.
      for (const key of ["move", "aim"] as const) {
        const s = sticksRef.current[key];
        if (!s) continue;
        const rect = canvas!.getBoundingClientRect();
        const bx = (s.baseX - rect.left) * devicePixelRatio;
        const by = (s.baseY - rect.top) * devicePixelRatio;
        ctx.strokeStyle = "rgba(232,236,244,0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, 34 * devicePixelRatio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(232,236,244,0.45)";
        ctx.beginPath();
        ctx.arc(bx + s.dx * 30 * devicePixelRatio, by + s.dy * 30 * devicePixelRatio, 14 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [you]);

  const view = game.view as ShooterView;
  const now = Date.now();
  const left = Math.max(0, view.endsAt - now);
  const me = you ? view.players.find((p) => p.sessionId === you) : undefined;
  const respawnIn = me && !me.alive && me.respawnAt ? Math.max(0, me.respawnAt - now) : null;
  const board = [...view.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const nameOf = (id: string) =>
    id === you ? "you" : (game.players.find((p) => p.sessionId === id)?.name ?? "?");

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-(family-name:--font-display) font-bold">💥 Blast Arena</span>
        <span className="rounded-full bg-line/60 px-3 py-1 font-mono text-xs text-ink-muted">
          {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
        </span>
        <span className="text-xs text-ink-muted">first to {view.targetKills}</span>
        {ping !== null && (
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${
              ping < 80 ? "bg-success/15 text-success" : ping < 200 ? "bg-line/60 text-ink-muted" : "bg-danger/15 text-danger"
            }`}
          >
            {ping} ms
          </span>
        )}
        {!you && <span className="glass rounded-full px-3 py-1 text-xs text-ink-muted">👀 Spectating</span>}
        <div className="ml-auto flex gap-2">
          {board.map((p) => {
            const meta = game.players.find((m) => m.sessionId === p.sessionId);
            return (
              <span key={p.sessionId} className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: meta?.avatarColor }} />
                {nameOf(p.sessionId)} · <b>{p.kills}</b>
                <span className="text-ink-muted">/{p.deaths}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="size-full touch-none rounded-xl" />

        {/* Kill feed */}
        <div className="pointer-events-none absolute top-2 right-3 space-y-1 text-right text-xs">
          {view.feed.slice(-4).map((k) => (
            <div key={`${k.at}-${k.victimId}`} className="glass rounded-lg px-2.5 py-1">
              <span className="font-semibold">{nameOf(k.killerId)}</span>
              <span className="mx-1 text-danger">💥</span>
              <span className="text-ink-muted">{nameOf(k.victimId)}</span>
            </div>
          ))}
        </div>

        {/* Respawn overlay */}
        {respawnIn !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-bg/50 backdrop-blur-[2px]">
            <div className="text-center">
              <div className="font-(family-name:--font-display) text-3xl font-bold text-danger">
                Eliminated
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                respawning in {(respawnIn / 1000).toFixed(1)}s
              </div>
            </div>
          </div>
        )}
      </div>

      {you && !finished && (
        <p className="text-center text-xs text-ink-muted">
          {isCoarsePointer()
            ? "Left thumb: move · Right thumb: aim & fire"
            : "WASD to move · mouse to aim · click to fire"}
        </p>
      )}
    </div>
  );
}
