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
pnpm dev
```
