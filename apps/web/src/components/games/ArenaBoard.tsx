import { useEffect, useRef, useState } from "react";
import {
  ARENA_WORLD,
  ORB_RADIUS,
  PLAYER_SIZE,
  integrateMove,
  type ArenaView,
} from "@gamehub/games/client";
import type { GameStateMsg } from "../../lib/room";
import { isCoarsePointer } from "../../lib/quality";

interface TouchStick {
  id: number;
  baseX: number;
  baseY: number;
  dx: number;
  dy: number;
}

interface Props {
  game: GameStateMsg;
  you: string | null;
  finished: boolean;
  ping: number | null;
  onMove(payload: unknown): void;
}

/** Other players render this far in the past, interpolated between snapshots. */
const INTERP_DELAY_MS = 120;
/** How aggressively the predicted self position is pulled toward the server's. */
const RECONCILE_RATE = 8;

interface Snapshot {
  at: number;
  view: ArenaView;
}

export default function ArenaBoard({ game, you, finished, ping, onMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  // Latest onMove without re-running the input effect on every snapshot
  // render (recreating the heartbeat interval constantly starves it).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const snapshotsRef = useRef<Snapshot[]>([]);
  const myPosRef = useRef<{ x: number; y: number } | null>(null);
  const dirRef = useRef({ dx: 0, dy: 0 });
  const seqRef = useRef(0);
  const stickRef = useRef<TouchStick | null>(null);
  const [, forceHud] = useState(0);

  // Record incoming snapshots for interpolation + reconciliation.
  useEffect(() => {
    const buf = snapshotsRef.current;
    buf.push({ at: Date.now(), view: game.view as ArenaView });
    if (buf.length > 30) buf.splice(0, buf.length - 30);
    forceHud((n) => n + 1); // scores/clock re-render at snapshot rate
  }, [game]);

  // Input: keyboard held keys OR a touch joystick (drag anywhere on the
  // arena) -> direction; send on change + heartbeat.
  useEffect(() => {
    if (finished || !you) return;
    const canvas = canvasRef.current;
    const held = new Set<string>();
    const KEYS: Record<string, [number, number]> = {
      w: [0, -1], arrowup: [0, -1],
      s: [0, 1], arrowdown: [0, 1],
      a: [-1, 0], arrowleft: [-1, 0],
      d: [1, 0], arrowright: [1, 0],
    };

    function currentDir() {
      let dx = 0;
      let dy = 0;
      for (const k of held) {
        const v = KEYS[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      return { dx: Math.max(-1, Math.min(1, dx)), dy: Math.max(-1, Math.min(1, dy)) };
    }

    function sendDir() {
      seqRef.current += 1;
      const d = dirRef.current;
      onMoveRef.current({ seq: seqRef.current, dx: d.dx, dy: d.dy });
    }

    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (!(k in KEYS)) return;
      e.preventDefault();
      const before = JSON.stringify(dirRef.current);
      if (e.type === "keydown") held.add(k);
      else held.delete(k);
      dirRef.current = currentDir();
      if (JSON.stringify(dirRef.current) !== before) sendDir();
    }

    // Touch joystick: first finger anchors the stick, dragging steers.
    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      if (stickRef.current) return;
      const t = e.changedTouches[0]!;
      stickRef.current = { id: t.identifier, baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 };
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const s = stickRef.current;
      if (!s) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== s.id) continue;
        let dx = (t.clientX - s.baseX) / 40;
        let dy = (t.clientY - s.baseY) / 40;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        s.dx = dx;
        s.dy = dy;
        dirRef.current = { dx, dy };
        sendDir();
      }
    }
    function onTouchEnd(e: TouchEvent) {
      const s = stickRef.current;
      if (!s) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== s.id) continue;
        stickRef.current = null;
        dirRef.current = { dx: 0, dy: 0 };
        sendDir();
      }
    }

    // Heartbeat keeps the server's held-direction fresh across packet loss.
    const heartbeat = setInterval(() => {
      if (dirRef.current.dx !== 0 || dirRef.current.dy !== 0) sendDir();
    }, 250);

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    canvas?.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas?.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas?.addEventListener("touchend", onTouchEnd);
    canvas?.addEventListener("touchcancel", onTouchEnd);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      canvas?.removeEventListener("touchstart", onTouchStart);
      canvas?.removeEventListener("touchmove", onTouchMove);
      canvas?.removeEventListener("touchend", onTouchEnd);
      canvas?.removeEventListener("touchcancel", onTouchEnd);
    };
    // onMove intentionally excluded — accessed via onMoveRef.
  }, [finished, you]);

  // Render loop: predict self, interpolate others.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    function playerAtTime(view: ArenaView, id: string) {
      return view.players.find((p) => p.sessionId === id);
    }

    function draw(now: number) {
      const dt = Math.min(100, now - last);
      last = now;
      const buf = snapshotsRef.current;
      const latest = buf.at(-1)?.view;
      if (!latest) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // --- self: local prediction + continuous reconciliation ---
      const serverMe = you ? playerAtTime(latest, you) : undefined;
      if (serverMe) {
        if (!myPosRef.current) myPosRef.current = { x: serverMe.x, y: serverMe.y };
        // Integrate my held direction locally (same math as the server)…
        myPosRef.current = integrateMove(myPosRef.current, dirRef.current, dt);
        // …then exponentially pull toward the authoritative position.
        const k = 1 - Math.exp((-RECONCILE_RATE * dt) / 1000);
        myPosRef.current.x += (serverMe.x - myPosRef.current.x) * k;
        myPosRef.current.y += (serverMe.y - myPosRef.current.y) * k;
      }

      // --- others: interpolate between the two snapshots around renderTime ---
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

      // --- paint ---
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const scale = Math.min(w / ARENA_WORLD.width, h / ARENA_WORLD.height);
      const ox = (w - ARENA_WORLD.width * scale) / 2;
      const oy = (h - ARENA_WORLD.height * scale) / 2;
      const X = (x: number) => ox + x * scale;
      const Y = (y: number) => oy + y * scale;

      ctx.clearRect(0, 0, w, h);
      // arena floor + grid
      ctx.fillStyle = "#160c26";
      ctx.fillRect(ox, oy, ARENA_WORLD.width * scale, ARENA_WORLD.height * scale);
      ctx.strokeStyle = "rgba(61,42,92,0.6)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= ARENA_WORLD.width; gx += 80) {
        ctx.beginPath();
        ctx.moveTo(X(gx), oy);
        ctx.lineTo(X(gx), Y(ARENA_WORLD.height));
        ctx.stroke();
      }
      for (let gy = 0; gy <= ARENA_WORLD.height; gy += 80) {
        ctx.beginPath();
        ctx.moveTo(ox, Y(gy));
        ctx.lineTo(X(ARENA_WORLD.width), Y(gy));
        ctx.stroke();
      }

      // orbs
      for (const orb of latest.orbs) {
        const r = ORB_RADIUS * scale;
        const g = ctx.createRadialGradient(X(orb.x), Y(orb.y), 0, X(orb.x), Y(orb.y), r * 2.2);
        g.addColorStop(0, "rgba(45,212,191,0.9)");
        g.addColorStop(1, "rgba(45,212,191,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(X(orb.x), Y(orb.y), r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2dd4bf";
        ctx.beginPath();
        ctx.arc(X(orb.x), Y(orb.y), r, 0, Math.PI * 2);
        ctx.fill();
      }

      // players
      const size = PLAYER_SIZE * scale;
      for (const p of latest.players) {
        let px = p.x;
        let py = p.y;
        if (p.sessionId === you && myPosRef.current) {
          px = myPosRef.current.x;
          py = myPosRef.current.y;
        } else if (older && newer) {
          const a = playerAtTime(older.view, p.sessionId);
          const b = playerAtTime(newer.view, p.sessionId);
          if (a && b) {
            px = a.x + (b.x - a.x) * alpha;
            py = a.y + (b.y - a.y) * alpha;
          }
        }
        const meta = gameRef.current.players.find((m) => m.sessionId === p.sessionId);
        const color = meta?.avatarColor ?? "#ff6b4a";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(X(px) - size / 2, Y(py) - size / 2, size, size, 6 * scale);
        ctx.fill();
        if (p.sessionId === you) {
          ctx.strokeStyle = "#f6ecff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = "#f6ecff";
        ctx.font = `${Math.max(10, 11 * scale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(
          p.sessionId === you ? "you" : (meta?.name ?? ""),
          X(px),
          Y(py) - size / 2 - 5,
        );
      }

      // Touch joystick overlay.
      const stick = stickRef.current;
      if (stick && canvas) {
        const rect = canvas.getBoundingClientRect();
        const bx = (stick.baseX - rect.left) * devicePixelRatio;
        const by = (stick.baseY - rect.top) * devicePixelRatio;
        ctx.strokeStyle = "rgba(232,236,244,0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, 34 * devicePixelRatio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(232,236,244,0.45)";
        ctx.beginPath();
        ctx.arc(
          bx + stick.dx * 30 * devicePixelRatio,
          by + stick.dy * 30 * devicePixelRatio,
          14 * devicePixelRatio,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    // Keep the canvas backing store matched to its CSS size.
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

  const view = game.view as ArenaView;
  const now = Date.now();
  const left = Math.max(0, view.endsAt - now);
  const scores = [...view.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-(family-name:--font-display) font-bold">🔮 Orb Arena</span>
        <span className="rounded-full bg-line/60 px-3 py-1 font-mono text-xs text-ink-muted">
          {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
        </span>
        <span className="text-xs text-ink-muted">first to {view.targetScore}</span>
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
          {scores.map((p) => {
            const meta = game.players.find((m) => m.sessionId === p.sessionId);
            return (
              <span key={p.sessionId} className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: meta?.avatarColor }} />
                {p.sessionId === you ? "you" : meta?.name} · <b>{p.score}</b>
              </span>
            );
          })}
        </div>
      </div>

      <canvas ref={canvasRef} className="min-h-0 w-full flex-1 touch-none rounded-xl" />

      {you && !finished && (
        <p className="text-center text-xs text-ink-muted">
          {isCoarsePointer()
            ? "Touch and drag anywhere to move"
            : "Move with WASD or arrow keys"}
        </p>
      )}
    </div>
  );
}
