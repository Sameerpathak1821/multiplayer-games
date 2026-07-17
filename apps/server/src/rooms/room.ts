import type { GuestSession } from "@gamehub/shared";
import {
  CLOSE_CODES,
  type RoomEventKind,
  type RoomSnapshot,
  type ClientMessage,
  type ServerMessage,
} from "@gamehub/shared";

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
  joinedAt: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoomOptions {
  maxPlayers: number;
  /** How long a disconnected member keeps their seat. */
  graceMs: number;
  /** Called when the last member is gone, so the manager can drop the room. */
  onEmpty: (code: string) => void;
}

export type JoinError = "room_full";

/**
 * One live room. Membership is keyed by sessionId (stable across reconnects),
 * never by socket — that's what makes rejoin/seat-reclaim work.
 */
export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  lastActivityAt = Date.now();
  ownerSessionId: string | null = null;
  private members = new Map<string, Member>();
  private opts: RoomOptions;

  constructor(code: string, opts: RoomOptions) {
    this.code = code;
    this.opts = opts;
  }

  get memberCount(): number {
    return this.members.size;
  }

  join(session: GuestSession, socket: MemberSocket): JoinError | null {
    this.touch();
    const existing = this.members.get(session.sessionId);

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
      this.broadcastState();
      return null;
    }

    if (this.members.size >= this.opts.maxPlayers) return "room_full";

    this.members.set(session.sessionId, {
      session,
      socket,
      connected: true,
      joinedAt: Date.now(),
      graceTimer: null,
    });
    if (!this.ownerSessionId) this.ownerSessionId = session.sessionId;
    this.emitEvent("joined", session.sessionId);
    this.broadcastState();
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

  private remove(sessionId: string, reason: "left" | "kicked"): void {
    const member = this.members.get(sessionId);
    if (!member) return;

    if (member.graceTimer) clearTimeout(member.graceTimer);
    this.members.delete(sessionId);
    this.emitEvent(reason, sessionId, member.session.name);

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
      members: [...this.members.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          sessionId: m.session.sessionId,
          name: m.session.name,
          avatarColor: m.session.avatarColor,
          connected: m.connected,
        })),
    };
  }

  /** Tear down all timers/sockets (server shutdown or TTL sweep). */
  destroy(): void {
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
