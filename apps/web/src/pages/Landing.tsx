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
  { icon: "⭕", name: "Tic-Tac-Toe", tag: "Turn duel", accent: "#ff6b4a" },
  { icon: "🧩", name: "Crossword Race", tag: "2–8 players", accent: "#2dd4bf" },
  { icon: "💥", name: "Blast Arena", tag: "Deathmatch", accent: "#ff3d81" },
  { icon: "🔮", name: "Orb Arena", tag: "Real-time", accent: "#c07cff" },
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

  const has3D = systemAllows3D();

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* CSS aurora + retro grid always paint (also the fallback when 3D is off) */}
      <div className="aurora" />
      <div className="retro-grid" />
      {has3D && (
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
      )}

      {/* DOM layer floating over the scene */}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4 sm:px-10">
          <div className="font-(family-name:--font-display) text-xl font-bold tracking-tight">
            Game<span className="text-gradient">Hub</span>
          </div>
          {session && (
            <button
              onClick={() => setEditingProfile(true)}
              className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition hover:ring-1 hover:ring-accent/50"
              title="Edit your name and color"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: session.avatarColor }}
              />
              <span className="hidden text-ink-muted sm:inline">playing as</span>
              <span className="max-w-28 truncate font-medium">{session.name}</span>
              <span className="text-xs text-ink-muted">✏️</span>
            </button>
          )}
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center sm:px-10 lg:items-start lg:text-left">
          <div className="w-full max-w-xl">
            <div className="rise mb-5 inline-flex items-center gap-2 rounded-full border border-accent-2/30 bg-accent-2/10 px-3 py-1 text-xs font-medium text-accent-2">
              <span className="pulse-glow inline-block size-2 rounded-full bg-accent" />
              No sign-up · Play in seconds
            </div>
            <h1 className="rise rise-1 font-(family-name:--font-display) text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Your room.
              <br />
              Your games.
              <br />
              <span className="text-gradient">One link.</span>
            </h1>
            <p className="rise rise-2 mx-auto mt-5 max-w-md text-base text-ink-muted sm:text-lg lg:mx-0">
              Spin up a room, share the code, and play with friends right in the browser — no
              downloads, no accounts.
            </p>

            <div className="rise rise-3 mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              <button
                onClick={createRoom}
                disabled={creating}
                className="bg-brand glow-accent rounded-2xl px-8 py-4 text-base font-bold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? "Creating…" : "🎮 Create a Room"}
              </button>
              <div className="glass flex items-center rounded-2xl p-1.5">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  inputMode="text"
                  autoCapitalize="characters"
                  className="w-full min-w-0 bg-transparent px-3 py-2.5 font-mono tracking-[0.25em] outline-none placeholder:text-ink-muted/50 sm:w-36"
                />
                <button
                  onClick={handleJoin}
                  className="shrink-0 rounded-xl bg-surface-raised px-5 py-2.5 font-semibold transition hover:bg-line"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="px-5 pb-8 sm:px-10">
          <p className="mb-3 text-center text-xs tracking-wide text-ink-muted uppercase lg:text-left">
            Featured games
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-center lg:justify-start">
            {LAUNCH_GAMES.map((g) => (
              <div
                key={g.name}
                className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 transition hover:scale-[1.03]"
                style={{ boxShadow: `inset 0 0 0 1px ${g.accent}22` }}
              >
                <span className="text-xl">{g.icon}</span>
                <span>
                  <span className="block text-sm font-semibold">{g.name}</span>
                  <span className="block text-xs" style={{ color: g.accent }}>
                    {g.tag}
                  </span>
                </span>
              </div>
            ))}
          </div>
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
