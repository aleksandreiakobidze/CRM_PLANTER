"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Bell } from "@/components/icons";
import { NOTICE_COPY } from "@/server/features/notifications/notification-copy";
import { BUSINESS_TIME_ZONE } from "@/server/time";

type Notice = {
  id: string;
  kind: string;
  title: string;
  href: string;
  createdAt: string;
  read: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "error");
  return data;
}

function kindLabel(kind: string) {
  if (kind === "task") return NOTICE_COPY.task;
  if (kind === "excursion") return NOTICE_COPY.excursion;
  return kind;
}

export function NotificationBell() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const data = await readJson<{ unread: number; items: Notice[] }>(await fetch("/api/notifications", { cache: "no-store" }));
    setUnread(data.unread);
    setItems(data.items);
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, open ? 4000 : 8000);
    return () => window.clearInterval(timer);
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  async function openNotice(item: Notice) {
    setOpen(false);
    if (!item.read) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => undefined);
      setUnread((count) => Math.max(0, count - 1));
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
    }
    router.push(item.href);
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setUnread(0);
    setItems((current) => current.map((row) => ({ ...row, read: true })));
  }

  return (
    <div className="notice-dock" ref={rootRef}>
      <button
        type="button"
        className="secondary notice-toggle"
        aria-expanded={open}
        aria-label={open ? NOTICE_COPY.close : NOTICE_COPY.open}
        title={NOTICE_COPY.open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} />
        {unread > 0 ? <span className="notice-badge">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notice-panel">
          <header>
            <strong>{NOTICE_COPY.open}</strong>
            {unread > 0 ? (
              <button type="button" className="secondary" onClick={() => void markAll()}>
                {NOTICE_COPY.markAll}
              </button>
            ) : null}
          </header>
          {items.length === 0 ? <p className="muted">{NOTICE_COPY.empty}</p> : null}
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className={item.read ? undefined : "is-unread"} onClick={() => void openNotice(item)}>
                  <small>
                    {kindLabel(item.kind)} · {formatInTimeZone(item.createdAt, BUSINESS_TIME_ZONE, "dd.MM HH:mm")}
                  </small>
                  <span>{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
