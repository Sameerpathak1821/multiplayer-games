import Fastify from "fastify";
import cors from "@fastify/cors";
import { createGuestSession, signSession, verifySessionToken } from "./auth";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = Fastify({ logger: true });

await app.register(cors, { origin: [WEB_ORIGIN] });

app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

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

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`GameHub server listening on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
