import { z } from "zod";

/**
 * The WebSocket protocol between client and room server.
 * Everything on the wire is JSON and validated with these schemas.
 */

export const memberInfoSchema = z.object({
  sessionId: z.string(),
  name: z.string(),
  avatarColor: z.string(),
  connected: z.boolean(),
});
export type MemberInfo = z.infer<typeof memberInfoSchema>;

export const roomSnapshotSchema = z.object({
  code: z.string(),
  ownerSessionId: z.string().nullable(),
  maxPlayers: z.number(),
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

/** Client → server messages. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("kick"), sessionId: z.string() }),
  z.object({ type: z.literal("transfer_owner"), sessionId: z.string() }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Server → client messages. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room:state"), room: roomSnapshotSchema, you: z.string() }),
  z.object({ type: z.literal("room:event"), event: roomEventSchema }),
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
  SUPERSEDED: 4008,
  KICKED: 4009,
} as const;

/** Closes the client should NOT retry after. */
export const FATAL_CLOSE_CODES: number[] = [
  CLOSE_CODES.INVALID_PARAMS,
  CLOSE_CODES.BAD_TOKEN,
  CLOSE_CODES.ROOM_FULL,
  CLOSE_CODES.ROOM_NOT_FOUND,
  CLOSE_CODES.KICKED,
];
