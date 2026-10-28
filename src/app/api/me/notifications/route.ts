/**
 * GET  /api/me/notifications — latest notifications and unread count
 * POST /api/me/notifications — mark all as read
 * Anonymous visitors simply get an empty list.
 */
import { getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, privateJson } from "@/server/http";
import type { NotificationView } from "@/lib/apiTypes";

export const GET = handle(async () => {
  const who = await getIdentity();
  if (!who.userId) return privateJson({ notifications: [], unread: 0 });
  const store = getStore();
  const [list, unread] = await Promise.all([store.listNotifications(who.userId, 30), store.unreadCount(who.userId)]);
  const notifications: NotificationView[] = list.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: Boolean(n.readAt),
  }));
  return privateJson({ notifications, unread });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  if (who.userId) await getStore().markNotificationsRead(who.userId);
  return privateJson({ ok: true });
});
