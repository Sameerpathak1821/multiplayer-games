import { z } from "zod";

/**
 * The WebSocket protocol between client and room server.
 * Everything on the wire is JSON and validated with these schemas.
 */

export const MAX_CHAT_LENGTH = 500;
export const CHAT_HISTORY_SIZE = 50;

/** Emoji allowed for one-tap reactions. */
export const REACTION_EMOJI = ["👍", "😂", "🔥", "❤️", "😮", "🎉", "😭", "💀"] as const;

export const memberInfoSchema = z.object({
  sessionId: z.string(),
  name: z.string(),
  avatarColor: z.string(),
  connected: z.boolean(),
  ready: z.boolean(),
});
export type MemberInfo = z.infer<typeof memberInfoSchema>;

export const roomSnapshotSchema = z.object({
  code: z.string(),
  ownerSessionId: z.string().nullable(),
  maxPlayers: z.number(),
  hasPassword: z.boolean(),
  members: z.array(memberInfoSchema),
});
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;

export const roomEventKindSchema = z.enum([
  "joined",
  "left",
  "kicked",
  "disconnected",
  "reconnected",
  "owner_changed",
]);
export type RoomEventKind = z.infer<typeof roomEventKindSchema>;

export const roomEventSchema = z.object({
  kind: roomEventKindSchema,
  sessionId: z.string(),
  name: z.string(),
  at: z.number(),
});
export type RoomEvent = z.infer<typeof roomEventSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  name: z.string(),
  avatarColor: z.string(),
  text: z.string(),
  at: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const reactionSchema = z.object({
  sessionId: z.string(),
  emoji: z.string(),
  at: z.number(),
});
export type Reaction = z.infer<typeof reactionSchema>;

/** Client → server messages. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("kick"), sessionId: z.string() }),
  z.object({ type: z.literal("transfer_owner"), sessionId: z.string() }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("chat:send"), text: z.string().min(1).max(MAX_CHAT_LENGTH) }),
  z.object({ type: z.literal("reaction:send"), emoji: z.enum(REACTION_EMOJI) }),
  z.object({ type: z.literal("ready:set"), ready: z.boolean() }),
  z.object({ type: z.literal("countdown:start") }),
  z.object({
    type: z.literal("settings:set_password"),
    password: z.string().min(1).max(50).nullable(),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Server → client messages. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room:state"), room: roomSnapshotSchema, you: z.string() }),
  z.object({ type: z.literal("room:event"), event: roomEventSchema }),
  z.object({ type: z.literal("chat:message"), message: chatMessageSchema }),
  z.object({ type: z.literal("chat:history"), messages: z.array(chatMessageSchema) }),
  z.object({ type: z.literal("reaction"), reaction: reactionSchema }),
  z.object({ type: z.literal("countdown"), n: z.number() }),
  z.object({ type: z.literal("lobby:launch") }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/**
 * WebSocket close codes. 4xxx are application-defined; the client uses them
 * to decide whether to auto-reconnect (network drops) or stop (kicked, full).
 */
export const CLOSE_CODES = {
  INVALID_PARAMS: 4000,
  BAD_TOKEN: 4001,
  ROOM_FULL: 4003,
  ROOM_NOT_FOUND: 4004,
  WRONG_PASSWORD: 4005,
  SUPERSEDED: 4008,
  KICKED: 4009,
  BANNED: 4010,
} as const;

/** Closes the client should NOT retry after. */
export const FATAL_CLOSE_CODES: number[] = [
  CLOSE_CODES.INVALID_PARAMS,
  CLOSE_CODES.BAD_TOKEN,
  CLOSE_CODES.ROOM_FULL,
  CLOSE_CODES.ROOM_NOT_FOUND,
  CLOSE_CODES.WRONG_PASSWORD,
  CLOSE_CODES.KICKED,
  CLOSE_CODES.BANNED,
];
