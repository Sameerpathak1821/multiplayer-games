import { useState } from "react";
import { AVATAR_COLORS, type GuestSession } from "@gamehub/shared";
import { updateProfile } from "../lib/session";

interface Props {
  session: GuestSession;
  onSaved(session: GuestSession): void;
  onClose(): void;
}

export default function ProfileEditor({ session, onSaved, onClose }: Props) {
  const [name, setName] = useState(session.name);
  const [color, setColor] = useState(session.avatarColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError("Name must be 2–24 characters");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(trimmed, color);
      onSaved(updated);
      onClose();
    } catch {
      setError("Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-xs rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-(family-name:--font-display) text-lg font-bold">Your profile</h2>

        <label className="mt-4 block text-xs text-ink-muted">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          maxLength={24}
          autoFocus
          className="mt-1 w-full rounded-xl bg-surface-raised px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-accent/60"
        />

        <label className="mt-4 block text-xs text-ink-muted">Color</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`size-8 rounded-full transition hover:scale-110 ${
                color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-surface-raised px-4 py-2.5 transition hover:bg-line"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
