import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestSession, ServerMessage } from "@gamehub/shared";
import { CLOSE_CODES } from "@gamehub/shared";
import { Room, type MemberSocket } from "./room";

class FakeSocket implements MemberSocket {
  sent: ServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
  lastState() {
    const states = this.sent.filter((m) => m.type === "room:state");
    return states.at(-1);
  }
  events() {
    return this.sent.filter((m) => m.type === "room:event").map((m) => m.event.kind);
  }
}

function session(id: string): GuestSession {
  return { sessionId: id, name: `user-${id}`, avatarColor: "#fff", isGuest: true };
}

describe("Room", () => {
  let room: Room;
  let emptied: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    emptied = [];
    room = new Room("TEST42", {
      maxPlayers: 3,
      graceMs: 1000,
      onEmpty: (c) => emptied.push(c),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first joiner becomes owner and receives state", () => {
    const s1 = new FakeSocket();
    expect(room.join(session("a"), s1)).toBeNull();
    expect(room.ownerSessionId).toBe("a");
    const state = s1.lastState();
    expect(state?.room.members).toHaveLength(1);
    expect(state?.you).toBe("a");
  });

  it("rejects joins beyond maxPlayers", () => {
    room.join(session("a"), new FakeSocket());
    room.join(session("b"), new FakeSocket());
    room.join(session("c"), new FakeSocket());
    expect(room.join(session("d"), new FakeSocket())).toBe("room_full");
  });

  it("reclaims the seat on reconnect within grace, notifying others", () => {
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    room.join(session("a"), s1);
    room.join(session("b"), s2);

    room.handleClose("a", s1);
    expect(s2.lastState()?.room.members.find((m) => m.sessionId === "a")?.connected).toBe(false);

    const s1b = new FakeSocket();
    room.join(session("a"), s1b);
    expect(s2.events()).toContain("reconnected");
    expect(s2.lastState()?.room.members.find((m) => m.sessionId === "a")?.connected).toBe(true);
    expect(room.memberCount).toBe(2);
  });

  it("removes the member after the grace period expires and transfers ownership", () => {
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    room.join(session("a"), s1);
    room.join(session("b"), s2);

    room.handleClose("a", s1);
    vi.advanceTimersByTime(1001);

    expect(room.memberCount).toBe(1);
    expect(room.ownerSessionId).toBe("b");
    expect(s2.events()).toContain("owner_changed");
  });

  it("a duplicate connection supersedes the old socket", () => {
    const first = new FakeSocket();
    room.join(session("a"), first);
    const second = new FakeSocket();
    room.join(session("a"), second);

    expect(first.closed?.code).toBe(CLOSE_CODES.SUPERSEDED);
    // The old socket's close must not evict the member.
    room.handleClose("a", first);
    expect(room.memberCount).toBe(1);
    expect(room.snapshot().members[0]?.connected).toBe(true);
  });

  it("owner can kick; kicked socket gets the KICKED close code", () => {
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    room.join(session("a"), s1);
    room.join(session("b"), s2);

    room.handleMessage("a", { type: "kick", sessionId: "b" });
    expect(room.memberCount).toBe(1);
    expect(s2.closed?.code).toBe(CLOSE_CODES.KICKED);
  });

  it("non-owner cannot kick", () => {
    room.join(session("a"), new FakeSocket());
    room.join(session("b"), new FakeSocket());
    room.handleMessage("b", { type: "kick", sessionId: "a" });
    expect(room.memberCount).toBe(2);
  });

  it("owner can transfer ownership to a connected member", () => {
    room.join(session("a"), new FakeSocket());
    room.join(session("b"), new FakeSocket());
    room.handleMessage("a", { type: "transfer_owner", sessionId: "b" });
    expect(room.ownerSessionId).toBe("b");
  });

  it("leave removes immediately and empties the room", () => {
    const s1 = new FakeSocket();
    room.join(session("a"), s1);
    room.handleMessage("a", { type: "leave" });
    expect(room.memberCount).toBe(0);
    expect(emptied).toEqual(["TEST42"]);
  });

  it("ownership passes to the longest-present member when owner leaves", () => {
    room.join(session("a"), new FakeSocket());
    vi.advanceTimersByTime(10);
    room.join(session("b"), new FakeSocket());
    vi.advanceTimersByTime(10);
    room.join(session("c"), new FakeSocket());

    room.handleMessage("a", { type: "leave" });
    expect(room.ownerSessionId).toBe("b");
  });
});
