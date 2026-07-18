import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  AVATAR_COLORS,
  MAX_ROOM_PLAYERS,
  isValidRoomCode,
  profileUpdateSchema,
} from "@gamehub/shared";
import { createGuestSession, signSession, verifySessionToken } from "./auth";
import { RoomManager } from "./rooms/manager";
import { attachRoomSockets } from "./ws";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = Fastify({ logger: true });
const rooms = new RoomManager();

await app.register(cors, { origin: [WEB_ORIGIN] });

app.get("/health", async () => ({ status: "ok", uptime: process.uptime(), rooms: rooms.roomCount }));

/**
 * Issue a guest identity. If the client presents a valid existing token
 * (Authorization: Bearer …) the same session is returned, so refreshes and
 * new tabs keep one identity per browser.
 */
app.post("/auth/guest", async (request) => {
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
 * Update the guest profile (name + avatar color). Keeps the same sessionId —
 * rooms recognize the player across the change — and returns a re-signed token.
 */
app.post("/auth/profile", async (request, reply) => {
  const auth = request.headers.authorization;
  const session = auth?.startsWith("Bearer ")
    ? await verifySessionToken(auth.slice("Bearer ".length))
    : null;
  if (!session) return reply.status(401).send({ error: "unauthorized" });

  const parsed = profileUpdateSchema.safeParse(request.body);
  if (!parsed.success || !(AVATAR_COLORS as readonly string[]).includes(parsed.data.avatarColor)) {
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

app.post("/rooms", async (request, reply) => {
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

app.get("/rooms/:code", async (request) => {
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

attachRoomSockets(app.server, rooms);

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`GameHub server listening on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
