import { randomUUID } from "node:crypto";
import type { GuestSession } from "@gamehub/shared";
import {
  CHAT_HISTORY_SIZE,
  CLOSE_CODES,
  type ChatMessage,
  type ClientMessage,
  type RoomEventKind,
  type RoomPhase,
  type RoomSnapshot,
  type ServerMessage,
} from "@gamehub/shared";
import type { GameResult } from "@gamehub/game-sdk";
import { GAME_REGISTRY } from "@gamehub/games";
import { GameSession } from "../games/session";

/**
 * Minimal socket surface the room needs — lets tests drive rooms with fakes.
 */
export interface MemberSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Member {
  session: GuestSession;
  socket: MemberSocket | null;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamps of recent sends, for rate limiting. */
  chatTimes: number[];
  reactionTimes: number[];
}

export interface RoomOptions {
  maxPlayers: number;
  /** How long a disconnected member keeps their seat. */
  graceMs: number;
  /** Delay between countdown ticks (shortened in tests). */
  countdownTickMs?: number;
  /** Override games' per-turn budget (shortened in tests). */
  turnTimeoutMs?: number;
  /** Override timed games' duration (shortened in tests). */
  gameDurationMs?: number;
  /** Called when the last member is gone, so the manager can drop the room. */
  onEmpty: (code: string) => void;
}

export type JoinError = "room_full" | "banned" | "wrong_password";

const CHAT_LIMIT = { max: 5, windowMs: 5000 };
const REACTION_LIMIT = { max: 10, windowMs: 5000 };

/**
 * One live room. Membership is keyed by sessionId (stable across reconnects),
 * never by socket — that's what makes rejoin/seat-reclaim work.
 */
export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  lastActivityAt = Date.now();
  ownerSessionId: string | null = null;
  password: string | null = null;
  gameKey: string | null = null;
  phase: RoomPhase = "lobby";
  private session: GameSession | null = null;
  private members = new Map<string, Member>();
  private banned = new Set<string>();
  private chatHistory: ChatMessage[] = [];
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private opts: RoomOptions;

  constructor(code: string, opts: RoomOptions) {
    this.code = code;
    this.opts = opts;
  }

  get memberCount(): number {
    return this.members.size;
  }

  join(session: GuestSession, socket: MemberSocket, password?: string): JoinError | null {
    this.touch();
    if (this.banned.has(session.sessionId)) return "banned";

    const existing = this.members.get(session.sessionId);
    // Existing members (reconnects) don't need the password again.
    if (!existing && this.password !== null && password !== this.password) {
      return "wrong_password";
    }

    if (existing) {
      // Seat reclaim: a new connection for a known session supersedes the old
      // socket (covers both reconnects and duplicate tabs).
      if (existing.socket && existing.connected) {
        existing.socket.close(CLOSE_CODES.SUPERSEDED, "connected elsewhere");
      }
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
      }
      const wasDisconnected = !existing.connected;
      existing.socket = socket;
      existing.connected = true;
      existing.session = session;
      if (wasDisconnected) this.emitEvent("reconnected", session.sessionId);
      this.sendTo(existing, { type: "chat:history", messages: this.chatHistory });
      this.broadcastState();
      this.sendGameStateTo(existing);
      return null;
    }

    if (this.members.size >= this.opts.maxPlayers) return "room_full";

    const member: Member = {
      session,
      socket,
      connected: true,
      ready: false,
      joinedAt: Date.now(),
      graceTimer: null,
      chatTimes: [],
      reactionTimes: [],
    };
    this.members.set(session.sessionId, member);
    if (!this.ownerSessionId) this.ownerSessionId = session.sessionId;
    this.emitEvent("joined", session.sessionId);
    this.sendTo(member, { type: "chat:history", messages: this.chatHistory });
    this.broadcastState();
    this.sendGameStateTo(member);
    return null;
  }

  handleMessage(sessionId: string, msg: ClientMessage): void {
    this.touch();
    const member = this.members.get(sessionId);
    if (!member) return;

    switch (msg.type) {
      case "ping":
        this.sendTo(member, { type: "pong" });
        break;
      case "leave":
        this.remove(sessionId, "left");
        break;
      case "kick":
        if (sessionId !== this.ownerSessionId || msg.sessionId === sessionId) return;
        this.banned.add(msg.sessionId);
        this.remove(msg.sessionId, "kicked");
        break;
      case "transfer_owner": {
        if (sessionId !== this.ownerSessionId) return;
        const target = this.members.get(msg.sessionId);
        if (!target || !target.connected) return;
        this.ownerSessionId = msg.sessionId;
        this.emitEvent("owner_changed", msg.sessionId);
        this.broadcastState();
        break;
      }
      case "chat:send": {
        if (!this.allowRate(member.chatTimes, CHAT_LIMIT)) {
          this.sendTo(member, {
            type: "error",
            code: "rate_limited",
            message: "You're sending messages too fast.",
          });
          return;
        }
        const text = msg.text.trim();
        if (!text) return;
        const message: ChatMessage = {
          id: randomUUID(),
          sessionId,
          name: member.session.name,
          avatarColor: member.session.avatarColor,
          text,
          at: Date.now(),
        };
        this.chatHistory = [...this.chatHistory.slice(-(CHAT_HISTORY_SIZE - 1)), message];
        this.broadcast({ type: "chat:message", message });
        break;
      }
      case "reaction:send": {
        if (!this.allowRate(member.reactionTimes, REACTION_LIMIT)) return;
        this.broadcast({
          type: "reaction",
          reaction: { sessionId, emoji: msg.emoji, at: Date.now() },
        });
        break;
      }
      case "ready:set":
        member.ready = msg.ready;
        this.broadcastState();
        break;
      case "countdown:start": {
        if (sessionId !== this.ownerSessionId || this.countdownTimer) return;
        if (this.phase === "playing") return;
        const connected = [...this.members.values()].filter((m) => m.connected);
        if (!connected.every((m) => m.ready)) return;
        if (this.gameKey) {
          const def = GAME_REGISTRY[this.gameKey];
          if (!def || connected.length < def.minPlayers) return;
        }
        this.runCountdown(3);
        break;
      }
      case "settings:set_password":
        if (sessionId !== this.ownerSessionId) return;
        this.password = msg.password;
        this.broadcastState();
        break;
      case "game:select":
        if (sessionId !== this.ownerSessionId || this.phase === "playing") return;
        if (msg.gameKey !== null && !GAME_REGISTRY[msg.gameKey]) return;
        this.gameKey = msg.gameKey;
        this.phase = "lobby";
        this.broadcastState();
        break;
      case "game:intent":
        if (this.phase !== "playing" || !this.session) return;
        this.session.applyIntent(sessionId, msg.payload);
        break;
    }
  }

  /** Socket dropped without an explicit leave — start the reconnect grace timer. */
  handleClose(sessionId: string, socket: MemberSocket): void {
    const member = this.members.get(sessionId);
    // Ignore closes from superseded sockets.
    if (!member || member.socket !== socket) return;

    member.socket = null;
    member.connected = false;
    this.emitEvent("disconnected", sessionId);
    this.broadcastState();

    member.graceTimer = setTimeout(() => {
      this.remove(sessionId, "left");
    }, this.opts.graceMs);
  }

  private runCountdown(n: number): void {
    if (n === 0) {
      this.countdownTimer = null;
      if (this.gameKey && GAME_REGISTRY[this.gameKey]) {
        this.startGame();
      } else {
        this.broadcast({ type: "lobby:launch" });
        for (const m of this.members.values()) m.ready = false;
        this.broadcastState();
      }
      return;
    }
    this.broadcast({ type: "countdown", n });
    this.countdownTimer = setTimeout(() => this.runCountdown(n - 1), this.opts.countdownTickMs ?? 1000);
  }

  /**
   * Seat the longest-present connected members (up to the game's max);
   * everyone else in the room spectates.
   */
  private startGame(): void {
    const def = GAME_REGISTRY[this.gameKey!]!;
    const players = [...this.members.values()]
      .filter((m) => m.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .slice(0, def.maxPlayers)
      .map((m) => ({
        id: m.session.sessionId,
        name: m.session.name,
        avatarColor: m.session.avatarColor,
      }));
    if (players.length < def.minPlayers) return;

    this.session = new GameSession(def, players, {
      turnTimeoutMs: this.opts.turnTimeoutMs,
      durationMs: this.opts.gameDurationMs,
      settings: this.opts.gameDurationMs ? { durationMs: this.opts.gameDurationMs } : {},
      onState: () => this.broadcastGameState(),
      onOver: (result, forfeitSessionId) => this.endGame(result, forfeitSessionId),
    });
    this.phase = "playing";
    for (const m of this.members.values()) m.ready = false;
    this.broadcastState();
    this.broadcastGameState();
  }

  private broadcastGameState(): void {
    for (const m of this.members.values()) this.sendGameStateTo(m);
  }

  private sendGameStateTo(member: Member): void {
    const session = this.session;
    if (!session || !this.gameKey) return;
    const viewerId = session.isPlayer(member.session.sessionId) ? member.session.sessionId : null;
    this.sendTo(member, {
      type: "game:state",
      gameKey: this.gameKey,
      view: session.viewFor(viewerId),
      players: session.players.map((p) => ({
        sessionId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
      })),
      turn: session.turn,
    });
  }

  private endGame(result: GameResult, forfeitSessionId?: string): void {
    const session = this.session;
    if (!session) return;
    const forfeit = forfeitSessionId
      ? {
          sessionId: forfeitSessionId,
          name:
            session.players.find((p) => p.id === forfeitSessionId)?.name ??
            this.members.get(forfeitSessionId)?.session.name ??
            "?",
        }
      : undefined;
    this.broadcast({ type: "game:over", result, forfeit });
    session.destroy();
    this.session = null;
    this.phase = "postgame";
    this.broadcastState();
  }

  private allowRate(times: number[], limit: { max: number; windowMs: number }): boolean {
    const now = Date.now();
    while (times.length > 0 && now - times[0]! > limit.windowMs) times.shift();
    if (times.length >= limit.max) return false;
    times.push(now);
    return true;
  }

  private remove(sessionId: string, reason: "left" | "kicked"): void {
    const member = this.members.get(sessionId);
    if (!member) return;

    if (member.graceTimer) clearTimeout(member.graceTimer);
    this.members.delete(sessionId);
    this.emitEvent(reason, sessionId, member.session.name);

    // A seated player abandoning mid-game forfeits to the others.
    if (this.session && this.phase === "playing" && this.session.isPlayer(sessionId)) {
      this.session.forfeit(sessionId);
    }

    if (member.socket) {
      if (reason === "kicked") member.socket.close(CLOSE_CODES.KICKED, "kicked by host");
      else member.socket.close(1000, "left");
    }

    // Never leave a room headless: hand ownership to the longest-present member.
    if (this.ownerSessionId === sessionId) {
      const next = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.ownerSessionId = next?.session.sessionId ?? null;
      if (next) this.emitEvent("owner_changed", next.session.sessionId);
    }

    if (this.members.size === 0) {
      this.opts.onEmpty(this.code);
      return;
    }
    this.broadcastState();
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      ownerSessionId: this.ownerSessionId,
      maxPlayers: this.opts.maxPlayers,
      hasPassword: this.password !== null,
      gameKey: this.gameKey,
      phase: this.phase,
      members: [...this.members.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          sessionId: m.session.sessionId,
          name: m.session.name,
          avatarColor: m.session.avatarColor,
          connected: m.connected,
          ready: m.ready,
        })),
    };
  }

  /** Tear down all timers/sockets (server shutdown or TTL sweep). */
  destroy(): void {
    this.session?.destroy();
    this.session = null;
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    for (const m of this.members.values()) {
      if (m.graceTimer) clearTimeout(m.graceTimer);
      m.socket?.close(1001, "room closed");
    }
    this.members.clear();
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }

  private emitEvent(kind: RoomEventKind, sessionId: string, name?: string): void {
    const member = this.members.get(sessionId);
    const event = {
      kind,
      sessionId,
      name: name ?? member?.session.name ?? "?",
      at: Date.now(),
    };
    this.broadcast({ type: "room:event", event });
  }

  private broadcastState(): void {
    const room = this.snapshot();
    for (const m of this.members.values()) {
      this.sendTo(m, { type: "room:state", room, you: m.session.sessionId });
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const m of this.members.values()) this.sendTo(m, msg);
  }

  private sendTo(member: Member, msg: ServerMessage): void {
    if (!member.connected || !member.socket) return;
    try {
      member.socket.send(JSON.stringify(msg));
    } catch {
      // Socket already dead; the close handler will deal with it.
    }
  }
}
