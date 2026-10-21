"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "@/components/icons";
import { CHAT_COPY } from "@/server/features/chat/chat-copy";
import type { ChatMessageDto } from "@/server/features/chat/chat-service";
import { BUSINESS_TIME_ZONE } from "@/server/time";
import { formatInTimeZone } from "date-fns-tz";

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "error");
  return data;
}

export function TaskChat({ threadId, title }: { threadId: string; title: string }) {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | undefined>(undefined);

  useEffect(() => {
    lastAt.current = undefined;
    let ignore = false;
    async function pull(after?: string) {
      const data = await readJson<{ messages: ChatMessageDto[] }>(
        await fetch(after ? `/api/chat/${threadId}?after=${encodeURIComponent(after)}` : `/api/chat/${threadId}`, { cache: "no-store" }),
      );
      if (ignore) return;
      setMessages((current) => {
        const next = after ? [...current, ...data.messages.filter((item) => !current.some((row) => row.id === item.id))] : data.messages;
        lastAt.current = next[next.length - 1]?.createdAt;
        return next;
      });
    }
    void pull().catch((item) => setError(item instanceof Error ? item.message : ""));
    const timer = window.setInterval(() => {
      void pull(lastAt.current).catch(() => undefined);
    }, 2500);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, threadId]);

  async function send() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const data = await readJson<{ message: ChatMessageDto }>(
        await fetch(`/api/chat/${threadId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: draft }),
        }),
      );
      setDraft("");
      setMessages((current) => {
        const next = current.some((item) => item.id === data.message.id) ? current : [...current, data.message];
        lastAt.current = next[next.length - 1]?.createdAt;
        return next;
      });
    } catch (item) {
      setError(item instanceof Error ? item.message : "");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="messenger-room task-chat" aria-live="polite">
      <header>
        <strong>{title}</strong>
      </header>
      <div className="messenger-log">
        {messages.length === 0 ? <p className="muted">{CHAT_COPY.empty}</p> : null}
        {messages.map((item) => (
          <article key={item.id} className={item.mine ? "mine" : undefined}>
            <small>
              {item.authorName} · {formatInTimeZone(item.createdAt, BUSINESS_TIME_ZONE, "HH:mm")}
            </small>
            <p>{item.body}</p>
          </article>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="messenger-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="chat-draft-task">
          {CHAT_COPY.write}
        </label>
        <input
          id="chat-draft-task"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={CHAT_COPY.write}
          autoComplete="off"
        />
        <button type="submit" disabled={pending || !draft.trim()}>
          <Send size={16} />
          {CHAT_COPY.send}
        </button>
      </form>
      {error ? <p className="err" role="alert">{error}</p> : null}
    </section>
  );
}
