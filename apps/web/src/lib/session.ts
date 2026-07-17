import { guestAuthResponseSchema, type GuestSession } from "@gamehub/shared";

const TOKEN_KEY = "gamehub.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Ensure this browser has a guest identity. Sends the existing token if we
 * have one so the server returns the same session instead of minting a new one.
 */
export async function ensureGuestSession(): Promise<GuestSession> {
  const existing = getToken();
  const res = await fetch("/api/auth/guest", {
    method: "POST",
    headers: existing ? { Authorization: `Bearer ${existing}` } : {},
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  const { token, session } = guestAuthResponseSchema.parse(await res.json());
  localStorage.setItem(TOKEN_KEY, token);
  return session;
}
