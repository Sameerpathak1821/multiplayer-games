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

  it("kick bans: the kicked session cannot rejoin", () => {
    room.join(session("a"), new FakeSocket());
    room.join(session("b"), new FakeSocket());
    room.handleMessage("a", { type: "kick", sessionId: "b" });
    expect(room.join(session("b"), new FakeSocket())).toBe("banned");
  });

  it("password-protected rooms reject wrong/missing passwords but not reconnects", () => {
    const s1 = new FakeSocket();
    room.join(session("a"), s1);
    room.handleMessage("a", { type: "settings:set_password", password: "secret" });

    expect(room.join(session("b"), new FakeSocket())).toBe("wrong_password");
    expect(room.join(session("b"), new FakeSocket(), "nope")).toBe("wrong_password");
    expect(room.join(session("b"), new FakeSocket(), "secret")).toBeNull();

    // Existing member reconnecting doesn't need the password.
    room.handleClose("a", s1);
    expect(room.join(session("a"), new FakeSocket())).toBeNull();
    expect(s1.lastState()).toBeDefined();
  });

  it("only the owner can set or clear the password", () => {
    room.join(session("a"), new FakeSocket());
    room.join(session("b"), new FakeSocket());
    room.handleMessage("b", { type: "settings:set_password", password: "hax" });
    expect(room.snapshot().hasPassword).toBe(false);
  });

  it("chat broadcasts to everyone and replays history to joiners", () => {
    const s1 = new FakeSocket();
    room.join(session("a"), s1);
    room.handleMessage("a", { type: "chat:send", text: "hello!" });

    const chats = s1.sent.filter((m) => m.type === "chat:message");
    expect(chats).toHaveLength(1);
    expect(chats[0]?.type === "chat:message" && chats[0].message.text).toBe("hello!");

    const s2 = new FakeSocket();
    room.join(session("b"), s2);
    const history = s2.sent.find((m) => m.type === "chat:history");
    expect(history?.type === "chat:history" && history.messages).toHaveLength(1);
  });

  it("rate-limits chat and tells the sender", () => {
    const s1 = new FakeSocket();
    room.join(session("a"), s1);
    for (let i = 0; i < 7; i++) room.handleMessage("a", { type: "chat:send", text: `m${i}` });

    const chats = s1.sent.filter((m) => m.type === "chat:message");
    const errors = s1.sent.filter((m) => m.type === "error");
    expect(chats).toHaveLength(5);
    expect(errors.length).toBeGreaterThan(0);

    // Window slides: after 5s more messages are allowed again.
    vi.advanceTimersByTime(5001);
    room.handleMessage("a", { type: "chat:send", text: "later" });
    expect(s1.sent.filter((m) => m.type === "chat:message")).toHaveLength(6);
  });

  it("countdown runs 3-2-1 then launches and resets ready flags", () => {
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    room.join(session("a"), s1);
    room.join(session("b"), s2);
    room.handleMessage("a", { type: "ready:set", ready: true });
    room.handleMessage("b", { type: "ready:set", ready: true });

    room.handleMessage("a", { type: "countdown:start" });
    vi.advanceTimersByTime(3000);

    const ticks = s2.sent.filter((m) => m.type === "countdown").map((m) => m.type === "countdown" && m.n);
    expect(ticks).toEqual([3, 2, 1]);
    expect(s2.sent.some((m) => m.type === "lobby:launch")).toBe(true);
    expect(room.snapshot().members.every((m) => !m.ready)).toBe(true);
  });

  it("countdown refuses to start unless everyone connected is ready, and only for the owner", () => {
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    room.join(session("a"), s1);
    room.join(session("b"), s2);
    room.handleMessage("a", { type: "ready:set", ready: true });

    room.handleMessage("a", { type: "countdown:start" });
    expect(s1.sent.some((m) => m.type === "countdown")).toBe(false);

    room.handleMessage("b", { type: "ready:set", ready: true });
    room.handleMessage("b", { type: "countdown:start" });
    expect(s1.sent.some((m) => m.type === "countdown")).toBe(false);
  });
});
