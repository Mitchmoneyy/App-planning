"use client";

/** Bell with unread count and a dropdown of recent notifications (signed-in users). */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "./MeProvider";
import type { NotificationView } from "@/lib/apiTypes";
import { api, timeAgo } from "@/lib/client";

const POLL_MS = 60_000;

export default function NotificationBell() {
  const { me } = useMe();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ notifications: NotificationView[]; unread: number }>("/api/me/notifications");
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      // ignore: try again on the next poll
    }
  }, []);

  useEffect(() => {
    if (!me?.user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => clearInterval(t);
  }, [me?.user, load]);

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!me?.user) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await api("/api/me/notifications", { body: {} }).catch(() => {});
    }
  }

  return (
    <div className="bell" ref={boxRef}>
      <button type="button" className="icon-pill" onClick={toggle} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5z M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        {unread > 0 && <span className="bell__count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell__menu panel-glass" role="dialog" aria-label="Notifications">
          <p className="bell__title">Notifications</p>
          {items.length === 0 && <p className="muted bell__empty">Nothing yet. When someone prays for you, you&apos;ll see it here.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={n.read ? "" : "is-unread"}>
                {n.link ? (
                  <Link href={n.link} onClick={() => setOpen(false)}>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <small>{timeAgo(n.createdAt)}</small>
                  </Link>
                ) : (
                  <div>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <small>{timeAgo(n.createdAt)}</small>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Link href="/me#notifications" className="bell__settings" onClick={() => setOpen(false)}>
            Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
