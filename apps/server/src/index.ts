import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  AVATAR_COLORS,
  MAX_ROOM_PLAYERS,
  isValidRoomCode,
  profileUpdateSchema,
} from "@gamehub/shared";
import { createGuestSession, signSession, verifySessionToken } from "./auth";
import { RoomManager } from "./rooms/manager";
import { attachRoomSockets } from "./ws";
import { RateLimiter } from "./rateLimit";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

// Fail fast: never run production on the baked-in dev secret.
if (IS_PROD && !process.env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET must be set in production");
  process.exit(1);
}

const app = Fastify({ logger: true, trustProxy: true });
const rooms = new RoomManager();

const limits = {
  auth: new RateLimiter(30, 60_000),
  profile: new RateLimiter(10, 60_000),
  createRoom: new RateLimiter(10, 5 * 60_000),
  roomInfo: new RateLimiter(120, 60_000),
};

await app.register(cors, { origin: [WEB_ORIGIN] });

// Unprefixed health check for the hosting platform.
app.get("/health", async () => ({ status: "ok", uptime: process.uptime(), rooms: rooms.roomCount }));

await app.register(
  async (api) => {
    api.get("/health", async () => ({ status: "ok" }));

    /**
     * Issue a guest identity. If the client presents a valid existing token
     * the same session is returned, so refreshes keep one identity.
     */
    api.post("/auth/guest", async (request, reply) => {
      if (!limits.auth.allow(request.ip)) return reply.status(429).send({ error: "slow down" });
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        const existing = await verifySessionToken(auth.slice("Bearer ".length));
        if (existing) {
          return { token: auth.slice("Bearer ".length), session: existing };
        }
      }
      const session = createGuestSession();
      const token = await signSession(session);
      return { token, session };
    });

    /**
     * Update the guest profile (name + avatar color). Keeps the same
     * sessionId and returns a re-signed token.
     */
    api.post("/auth/profile", async (request, reply) => {
      if (!limits.profile.allow(request.ip)) return reply.status(429).send({ error: "slow down" });
      const auth = request.headers.authorization;
      const session = auth?.startsWith("Bearer ")
        ? await verifySessionToken(auth.slice("Bearer ".length))
        : null;
      if (!session) return reply.status(401).send({ error: "unauthorized" });

      const parsed = profileUpdateSchema.safeParse(request.body);
      if (
        !parsed.success ||
        !(AVATAR_COLORS as readonly string[]).includes(parsed.data.avatarColor)
      ) {
        return reply.status(400).send({ error: "invalid profile" });
      }

      const updated = {
        ...session,
        name: parsed.data.name.trim(),
        avatarColor: parsed.data.avatarColor,
      };
      const token = await signSession(updated);
      return { token, session: updated };
    });

    api.post("/rooms", async (request, reply) => {
      if (!limits.createRoom.allow(request.ip)) {
        return reply.status(429).send({ error: "too many rooms created — wait a bit" });
      }
      const auth = request.headers.authorization;
      const session = auth?.startsWith("Bearer ")
        ? await verifySessionToken(auth.slice("Bearer ".length))
        : null;
      if (!session) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = (request.body ?? {}) as { maxPlayers?: number };
      const maxPlayers = Math.min(Math.max(Number(body.maxPlayers) || 8, 2), MAX_ROOM_PLAYERS);
      const room = rooms.createRoom(maxPlayers);
      return { code: room.code };
    });

    api.get("/rooms/:code", async (request, reply) => {
      if (!limits.roomInfo.allow(request.ip)) return reply.status(429).send({ error: "slow down" });
      const { code } = request.params as { code: string };
      if (!isValidRoomCode(code.toUpperCase())) return { exists: false };
      const room = rooms.getRoom(code);
      if (!room) return { exists: false };
      const snapshot = room.snapshot();
      return {
        exists: true,
        players: snapshot.members.length,
        maxPlayers: snapshot.maxPlayers,
        full: snapshot.members.length >= snapshot.maxPlayers,
        hasPassword: snapshot.hasPassword,
      };
    });
  },
  { prefix: "/api" },
);

// Serve the built frontend (single-service deployment). In dev, Vite serves
// the app and proxies /api + /ws here instead.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api")) {
      return reply.sendFile("index.html"); // SPA fallback for /r/:code etc.
    }
    return reply.status(404).send({ error: "not found" });
  });
  app.log.info(`serving frontend from ${webDist}`);
}

attachRoomSockets(app.server, rooms);

// Graceful shutdown: close every room (clients see 1001 and show a clear
// message) before the process exits.
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received — closing ${rooms.roomCount} room(s)`);
    rooms.destroy();
    void app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`GameHub server listening on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
