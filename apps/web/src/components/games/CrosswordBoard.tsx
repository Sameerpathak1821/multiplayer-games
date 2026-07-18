import { useEffect, useMemo, useRef, useState } from "react";
import {
  entryCells,
  type CrosswordEntryPub,
  type CrosswordRival,
  type CrosswordView,
} from "@gamehub/games/client";
import type { GameStateMsg } from "../../lib/room";

interface Props {
  game: GameStateMsg;
  you: string | null;
  finished: boolean;
  onMove(payload: unknown): void;
}

function useNow(intervalMs = 300): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function RaceClock({ endsAt, ended }: { endsAt: number; ended: boolean }) {
  const now = useNow(300);
  const left = Math.max(0, endsAt - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const urgent = left < 30_000 && !ended;
  return (
    <span
      className={`rounded-full px-3 py-1 font-mono text-sm ${
        urgent ? "bg-danger/15 text-danger" : "bg-line/60 text-ink-muted"
      }`}
    >
      {ended ? "—" : `${m}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

/** A rival's board as a tiny silhouette: cells fill in, letters stay hidden. */
function RivalChip({
  rival,
  name,
  view,
}: {
  rival: CrosswordRival;
  name: string;
  view: CrosswordView;
}) {
  const filled = useMemo(() => new Set(rival.filled), [rival.filled]);
  const playable = useMemo(() => new Set(view.cells), [view.cells]);
  return (
    <div className="glass flex items-center gap-2.5 rounded-xl px-3 py-2">
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${view.width}, 4px)` }}
        aria-hidden
      >
        {Array.from({ length: view.width * view.height }, (_, i) => (
          <div
            key={i}
            className="size-1"
            style={{
              backgroundColor: !playable.has(i)
                ? "transparent"
                : filled.has(i)
                  ? "var(--color-accent)"
                  : "var(--color-line)",
            }}
          />
        ))}
      </div>
      <div className="text-xs">
        <div className="max-w-24 truncate font-medium">
          {rival.finished ? "🏁 " : ""}
          {name}
        </div>
        <div className="text-ink-muted">{rival.score} pts</div>
      </div>
    </div>
  );
}

export default function CrosswordBoard({ game, you, finished, onMove }: Props) {
  const view = game.view as CrosswordView;
  const now = useNow(300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const playable = useMemo(() => new Set(view.cells), [view.cells]);
  const selected = view.entries.find((e) => e.id === selectedId) ?? null;
  const selectedCells = useMemo(
    () => new Set(selected ? entryCells(selected, view.width) : []),
    [selected, view.width],
  );

  const done = finished || view.ended || view.you?.finishedAt != null;
  const canSolve = !done && view.you !== null;

  useEffect(() => {
    setDraft("");
    inputRef.current?.focus();
  }, [selectedId]);

  function submit() {
    if (!selected || !canSolve) return;
    const answer = draft.trim().toUpperCase();
    if (answer.length !== selected.len) return;
    onMove({ entryId: selected.id, answer });
    setDraft("");
  }

  function cooldownLeft(id: string): number {
    const until = view.you?.cooldownUntil[id] ?? 0;
    return Math.max(0, until - now);
  }

  function clueRow(e: CrosswordEntryPub) {
    const solved = view.you?.solved.includes(e.id) ?? false;
    const cd = cooldownLeft(e.id);
    return (
      <button
        key={e.id}
        onClick={() => canSolve && !solved && setSelectedId(e.id)}
        disabled={!canSolve || solved}
        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
          selectedId === e.id
            ? "bg-accent/15 ring-1 ring-accent"
            : solved
              ? "opacity-45"
              : canSolve
                ? "hover:bg-line/40"
                : ""
        }`}
      >
        <span className="font-semibold">{e.number}.</span>{" "}
        <span className={solved ? "line-through" : ""}>{e.clue}</span>{" "}
        <span className="text-ink-muted">({e.len})</span>
        {solved && <span className="ml-1 text-success">✓</span>}
        {cd > 0 && (
          <span className="ml-1 text-danger">wait {Math.ceil(cd / 1000)}s</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Top bar: title, clock, you, rivals */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-(family-name:--font-display) font-bold">🧩 {view.title}</span>
        <RaceClock endsAt={view.endsAt} ended={view.ended || finished} />
        {view.you && (
          <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
            {view.you.score} pts
          </span>
        )}
        {view.you?.finishedAt != null && !finished && (
          <span className="text-sm text-success">🏁 Finished!</span>
        )}
        {view.you === null && (
          <span className="glass rounded-full px-3 py-1 text-xs text-ink-muted">👀 Spectating</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {view.rivals.map((r) => (
            <RivalChip
              key={r.sessionId}
              rival={r}
              view={view}
              name={game.players.find((p) => p.sessionId === r.sessionId)?.name ?? "?"}
            />
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-[auto_1fr]">
        {/* Grid */}
        <div className="flex max-w-full flex-col items-center gap-3 overflow-x-auto">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${view.width}, minmax(0, min(2.1rem, ${(88 / view.width).toFixed(1)}vw)))`,
            }}
          >
            {Array.from({ length: view.width * view.height }, (_, i) =>
              playable.has(i) ? (
                <button
                  key={i}
                  onClick={() => {
                    const owners = view.entries.filter((e) =>
                      entryCells(e, view.width).includes(i),
                    );
                    if (owners.length === 0 || !canSolve) return;
                    const next =
                      owners.find((e) => e.id !== selectedId && !view.you?.solved.includes(e.id)) ??
                      owners[0]!;
                    setSelectedId(next.id);
                  }}
                  className={`relative flex aspect-square items-center justify-center rounded-md text-sm font-bold uppercase transition ${
                    selectedCells.has(i)
                      ? "bg-accent/25 ring-1 ring-accent"
                      : view.you?.letters[i]
                        ? "bg-surface-raised text-accent"
                        : "bg-surface-raised/70"
                  }`}
                >
                  {view.numbers[i] && (
                    <span className="absolute top-0 left-0.5 text-[8px] font-normal text-ink-muted">
                      {view.numbers[i]}
                    </span>
                  )}
                  {view.you?.letters[i] ?? ""}
                </button>
              ) : (
                <div key={i} className="aspect-square" />
              ),
            )}
          </div>

          {/* Answer input */}
          {canSolve && selected && !view.you?.solved.includes(selected.id) && (
            <div className="flex w-full max-w-xs items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={selected.len}
                placeholder={`${selected.number} ${selected.dir === "across" ? "→" : "↓"} (${selected.len} letters)`}
                disabled={cooldownLeft(selected.id) > 0}
                className="min-w-0 flex-1 rounded-xl bg-surface-raised px-3 py-2 font-mono text-sm tracking-[0.2em] uppercase outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50"
              />
              <button
                onClick={submit}
                disabled={draft.length !== selected.len || cooldownLeft(selected.id) > 0}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
              >
                {cooldownLeft(selected.id) > 0
                  ? `${Math.ceil(cooldownLeft(selected.id) / 1000)}s`
                  : "Try"}
              </button>
            </div>
          )}
        </div>

        {/* Clues */}
        <div className="grid min-h-0 grid-cols-1 content-start gap-4 sm:grid-cols-2">
          {(["across", "down"] as const).map((dir) => (
            <div key={dir}>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {dir}
              </div>
              <div className="space-y-0.5">
                {view.entries
                  .filter((e) => e.dir === dir)
                  .sort((a, b) => a.number - b.number)
                  .map(clueRow)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
