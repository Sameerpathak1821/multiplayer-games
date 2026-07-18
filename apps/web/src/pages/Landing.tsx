import { Suspense, lazy, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GuestSession } from "@gamehub/shared";
import { isValidRoomCode } from "@gamehub/shared";
import { ensureGuestSession, getToken } from "../lib/session";
import { systemAllows3D } from "../lib/quality";
import ProfileEditor from "../components/ProfileEditor";

// Three.js stays out of the main bundle; the page renders instantly and the
// scene fades in when ready.
const HeroScene = lazy(() => import("../scene/HeroScene"));

const LAUNCH_GAMES = [
  { name: "Tic-Tac-Toe", tag: "Turn duel", accent: "#22d3ee" },
  { name: "Crossword Race", tag: "2–8 players", accent: "#34d399" },
  { name: "Arena Shooter", tag: "Top-down 3D", accent: "#fb7185" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [session, setSession] = useState<GuestSession | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(() => {
    ensureGuestSession()
      .then(setSession)
      .catch(() => setNotice("Server offline — start apps/server to get an identity"));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function createRoom() {
    setCreating(true);
    try {
      await ensureGuestSession();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const { code } = (await res.json()) as { code: string };
      navigate(`/r/${code}`);
    } catch {
      setNotice("Couldn't create a room — is the server running?");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!isValidRoomCode(code)) {
      setNotice("Room codes are 6 characters, like AB3XK9");
      return;
    }
    navigate(`/r/${code}`);
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {systemAllows3D() && (
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
      )}

      {/* DOM layer floating over the scene */}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-6 py-4 sm:px-10">
          <div className="font-(family-name:--font-display) text-xl font-bold tracking-tight">
            Game<span className="text-accent">Hub</span>
          </div>
          {session && (
            <button
              onClick={() => setEditingProfile(true)}
              className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition hover:ring-1 hover:ring-accent/50"
              title="Edit your name and color"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: session.avatarColor }}
              />
              <span className="text-ink-muted">playing as</span>
              <span className="font-medium">{session.name}</span>
              <span className="text-xs text-ink-muted">✏️</span>
            </button>
          )}
        </header>

        <main className="flex flex-1 items-center px-6 sm:px-10">
          <div className="max-w-xl">
            <h1 className="font-(family-name:--font-display) text-5xl leading-tight font-bold tracking-tight sm:text-6xl">
              Your room.
              <br />
              Your games.
              <br />
              <span className="text-accent">One link.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-muted">
              Create a room, share the code, and play with friends in seconds. No downloads, no
              sign-up.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={createRoom}
                disabled={creating}
                className="rounded-xl bg-accent px-7 py-3.5 font-semibold text-bg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create a Room"}
              </button>
              <div className="glass flex items-center rounded-xl p-1.5">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  className="w-36 bg-transparent px-3 py-2 font-mono tracking-[0.2em] outline-none placeholder:text-ink-muted/60"
                />
                <button
                  onClick={handleJoin}
                  className="rounded-lg bg-surface-raised px-4 py-2 font-medium transition hover:bg-line"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-3 px-6 pb-8 sm:px-10">
          <span className="text-sm text-ink-muted">Launch games:</span>
          {LAUNCH_GAMES.map((g) => (
            <div key={g.name} className="glass flex items-center gap-2 rounded-full px-4 py-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: g.accent }} />
              <span className="text-sm font-medium">{g.name}</span>
              <span className="text-xs text-ink-muted">{g.tag}</span>
            </div>
          ))}
        </footer>
      </div>

      {notice && (
        <div className="glass absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-xl px-5 py-3 text-sm">
          {notice}
        </div>
      )}

      {editingProfile && session && (
        <ProfileEditor
          session={session}
          onSaved={setSession}
          onClose={() => setEditingProfile(false)}
        />
      )}
    </div>
  );
}
