import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@gamehub/shared";
import { MAX_CHAT_LENGTH, REACTION_EMOJI } from "@gamehub/shared";

interface Props {
  messages: ChatMessage[];
  you: string | null;
  onSend(text: string): void;
  onReact(emoji: (typeof REACTION_EMOJI)[number]): void;
}

export default function ChatPanel({ messages, you, onSend, onReact }: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-2xl">
      <div className="border-b border-line/60 px-4 py-3 text-sm font-semibold">Chat</div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="pt-4 text-center text-sm text-ink-muted">
            Say hi — messages stay in the room.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm leading-snug">
            <span className="font-semibold" style={{ color: m.avatarColor }}>
              {m.sessionId === you ? "you" : m.name}
            </span>{" "}
            <span className="break-words text-ink">{m.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-t border-line/60 px-3 py-2">
        {REACTION_EMOJI.map((e) => (
          <button
            key={e}
            onClick={() => onReact(e)}
            className="rounded-lg px-1.5 py-1 text-lg transition hover:scale-125 hover:bg-line/50"
            title={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-t border-line/60 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Message…"
          className="min-w-0 flex-1 rounded-xl bg-surface-raised px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-muted/60 focus:ring-1 focus:ring-accent/50"
        />
        <button
          onClick={submit}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:brightness-110 active:scale-95"
        >
          Send
        </button>
      </div>
    </div>
  );
}
