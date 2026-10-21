"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X } from "@/components/icons";
import { CHAT_COPY } from "@/server/features/chat/chat-copy";
import type { ChatMemberDto, ChatMessageDto, ChatThreadDto } from "@/server/features/chat/chat-service";
import { BUSINESS_TIME_ZONE } from "@/server/time";
import { formatInTimeZone } from "date-fns-tz";

type Inbox = {
  me: { id: string; name: string };
  threads: ChatThreadDto[];
  members: ChatMemberDto[];
  unread: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "error");
  return data;
}

export function MessengerDock() {
  const path = usePathname();
  if (path === "/chat" || /^\/work\/[^/]+$/.test(path)) return null;
  return <Messenger variant="dock" />;
}

export function MessengerPage() {
  return <Messenger variant="page" />;
}

function Messenger({ variant }: { variant: "dock" | "page" }) {
  const [open, setOpen] = useState(variant === "page");
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | undefined>(undefined);

  const loadInbox = useCallback(async () => {
    const data = await readJson<Inbox>(await fetch("/api/chat", { cache: "no-store" }));
    setInbox(data);
    setThreadId((current) => current ?? data.threads.find((item) => item.kind === "team")?.id ?? data.threads[0]?.id ?? null);
    return data;
  }, []);

  useEffect(() => {
    void loadInbox().catch(() => undefined);
    const wait = open ? 2500 : 8000;
    const timer = window.setInterval(() => {
      void loadInbox().catch(() => undefined);
    }, wait);
    return () => window.clearInterval(timer);
  }, [loadInbox, open]);

  useEffect(() => {
    if (!open || !threadId) return;
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
  }, [open, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, threadId]);

  const thread = inbox?.threads.find((item) => item.id === threadId);

  async function send() {
    if (!threadId || pending) return;
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
      void loadInbox();
    } catch (item) {
      setError(item instanceof Error ? item.message : "");
    } finally {
      setPending(false);
    }
  }

  async function openDirect(userId: string) {
    setError("");
    try {
      const data = await readJson<{ id: string }>(
        await fetch("/api/chat/direct", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
      setThreadId(data.id);
      setMessages([]);
      setOpen(true);
      void loadInbox();
    } catch (item) {
      setError(item instanceof Error ? item.message : "");
    }
  }

  const panel = (
    <div className={variant === "page" ? "messenger-page" : "messenger-panel"}>
      <aside className="messenger-aside">
        <h2>{CHAT_COPY.chat}</h2>
        <ul className="messenger-threads">
          {(inbox?.threads ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === threadId ? "is-current" : undefined}
                onClick={() => {
                  setThreadId(item.id);
                  setMessages([]);
                }}
              >
                <strong>{item.title}</strong>
                {item.preview ? <span>{item.preview}</span> : null}
                {item.unread > 0 ? <em>{item.unread}</em> : null}
              </button>
            </li>
          ))}
        </ul>
        {(inbox?.members.length ?? 0) > 0 ? (
          <div className="messenger-members">
            <p>{CHAT_COPY.members}</p>
            <ul>
              {inbox?.members.map((member) => (
                <li key={member.id}>
                  <button type="button" onClick={() => void openDirect(member.id)}>
                    {member.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
      <section className="messenger-room" aria-live="polite">
        <header>
          <strong>{thread?.title ?? CHAT_COPY.chat}</strong>
          {variant === "dock" ? (
            <button type="button" className="secondary" onClick={() => setOpen(false)} aria-label={CHAT_COPY.close}>
              <X size={16} />
            </button>
          ) : null}
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
          <label className="sr-only" htmlFor={`chat-draft-${variant}`}>
            {CHAT_COPY.write}
          </label>
          <input
            id={`chat-draft-${variant}`}
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
    </div>
  );

  if (variant === "page") return panel;

  return (
    <div className="messenger-dock">
      <button
        type="button"
        className="secondary messenger-toggle"
        aria-expanded={open}
        aria-label={open ? CHAT_COPY.close : CHAT_COPY.open}
        title={CHAT_COPY.chat}
        onClick={() => setOpen((current) => !current)}
      >
        <MessageCircle size={18} />
        {(inbox?.unread ?? 0) > 0 ? <span className="messenger-badge">{inbox?.unread}</span> : null}
      </button>
      {open ? panel : null}
    </div>
  );
}
