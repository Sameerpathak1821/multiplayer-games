import { randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@gamehub/shared";
import { Room, type RoomOptions } from "./room";

const DEFAULT_MAX_PLAYERS = 8;
const RECONNECT_GRACE_MS = 90_000;
/** A room nobody has joined yet (creator still navigating) survives this long. */
const EMPTY_ROOM_TTL_MS = 5 * 60_000;
/** A room with members but no activity is reaped after this long. */
const IDLE_ROOM_TTL_MS = 24 * 60 * 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(private overrides: Partial<RoomOptions> = {}) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    // Don't keep the process alive just to sweep.
    if (typeof this.sweeper.unref === "function") this.sweeper.unref();
  }

  createRoom(maxPlayers = DEFAULT_MAX_PLAYERS): Room {
    const code = this.generateCode();
    const room = new Room(code, {
      maxPlayers,
      graceMs: RECONNECT_GRACE_MS,
      onEmpty: (c) => this.dropRoom(c),
      ...this.overrides,
    });
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private dropRoom(code: string): void {
    this.rooms.get(code)?.destroy();
    this.rooms.delete(code);
  }

  private generateCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idleMs = now - room.lastActivityAt;
      const isDead =
        (room.memberCount === 0 && idleMs > EMPTY_ROOM_TTL_MS) || idleMs > IDLE_ROOM_TTL_MS;
      if (isDead) this.dropRoom(code);
    }
  }

  destroy(): void {
    clearInterval(this.sweeper);
    for (const code of [...this.rooms.keys()]) this.dropRoom(code);
  }
}
