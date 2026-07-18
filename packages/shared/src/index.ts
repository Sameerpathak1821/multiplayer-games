import { z } from "zod";

export * from "./protocol";

/**
 * Room codes use an alphabet with no ambiguous characters (0/O, 1/I/L).
 */
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;

export const MAX_ROOM_PLAYERS = 16;
export const RECONNECT_GRACE_SECONDS = 90;

export const guestSessionSchema = z.object({
  sessionId: z.string(),
  name: z.string().min(1).max(24),
  avatarColor: z.string(),
  isGuest: z.literal(true),
});

export type GuestSession = z.infer<typeof guestSessionSchema>;

export const guestAuthResponseSchema = z.object({
  token: z.string(),
  session: guestSessionSchema,
});

export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

/**
 * Avatar palette — one electric accent per player, readable on the dark theme.
 */
export const AVATAR_COLORS = [
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#f472b6", // pink
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
  "#60a5fa", // blue
  "#c084fc", // purple
] as const;

/** Player-editable profile fields (no accounts — this is all there is). */
export const profileUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(24)
    // Printable characters only — no control chars or zero-width tricks.
    .regex(/^[^\p{C}]+$/u),
  avatarColor: z.string(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}
