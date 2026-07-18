# Multiplayer Game Hub

A real-time multiplayer gaming platform for the browser. Create a room, share the code, and play with friends — no downloads, no sign-up required.

## Core Features

- **Rooms** — create a room, get a shareable 6-character code / link, friends join instantly
- **Real-time lobby** — chat, presence, ready-up, reconnection with seat reclaim
- **Server-authoritative games** — cheat-proof by design; clients send intents, the server owns the state
- **3D experience** — low-poly 3D game boards and lobby built with React Three Fiber

## Launch Games

1. **Tic-Tac-Toe** — turn-based, with best-of-N series mode
2. **Crossword Race** — same grid, first to fill it wins
3. **Arena Shooter** — top-down 3D deathmatch, 2–8 players

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind, React Three Fiber |
| Realtime | Colyseus (WebSockets, server-authoritative) |
| API | Fastify (REST) |
| Data | Postgres (durable) + Redis (live rooms, presence) |
| Monorepo | Turborepo + pnpm |

## Structure

```
apps/
  web/        # React client
  server/     # Colyseus + Fastify backend
packages/
  game-sdk/   # GameDefinition contract every game implements
  games/      # pure game logic, one package per game
  shared/     # shared types, event contracts, constants
```

## Development

```bash
pnpm install
pnpm dev        # starts the API/WS server (:8080) and the Vite app (:5173)
```

Open http://localhost:5173. No sign-up exists anywhere — every visitor gets an
auto-generated guest identity they can rename via the "playing as" chip.

## Deploying for free (Render)

The whole app ships as **one service**: the Node server hosts the REST API,
the WebSocket rooms, and the built frontend.

1. Push this repo to GitHub.
2. Create a free account at [render.com](https://render.com) (sign in with GitHub).
3. **New → Blueprint**, pick this repository — Render reads
   [render.yaml](render.yaml) and configures everything (build, start,
   health check, and a generated `AUTH_SECRET`).
4. Deploy. Your game is live at `https://gamehub-<something>.onrender.com` —
   share `.../r/CODE` links with friends.

Free-tier notes:

- The instance **sleeps after ~15 minutes idle**; the first visitor waits
  ~30–60 s while it wakes. Fine for playing with friends, not for launch day.
- Rooms live in memory on a single instance — a redeploy ends active games
  (players see a clear "room closed" message).

Any other Node host (Railway, Fly.io, a $4 VPS) works the same way:
`pnpm install && pnpm build`, then `pnpm --filter @gamehub/server start` with
`NODE_ENV=production` and a random `AUTH_SECRET`.
