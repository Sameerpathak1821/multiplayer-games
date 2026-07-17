import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { AVATAR_COLORS, type GuestSession } from "@gamehub/shared";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret-change-in-production",
);

const ADJECTIVES = [
  "Swift", "Clever", "Mighty", "Sneaky", "Cosmic", "Blazing", "Frosty", "Lucky",
  "Silent", "Golden", "Neon", "Turbo", "Wild", "Epic", "Shadow", "Electric",
];

const NOUNS = [
  "Falcon", "Panda", "Tiger", "Wizard", "Ninja", "Rocket", "Phoenix", "Wolf",
  "Knight", "Comet", "Dragon", "Otter", "Viper", "Raven", "Fox", "Golem",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export function createGuestSession(): GuestSession {
  return {
    sessionId: randomUUID(),
    name: `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(Math.random() * 90) + 10}`,
    avatarColor: pick(AVATAR_COLORS),
    isGuest: true,
  };
}

export async function signSession(session: GuestSession): Promise<string> {
  return new SignJWT({ session })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sessionId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<GuestSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.session as GuestSession) ?? null;
  } catch {
    return null;
  }
}
