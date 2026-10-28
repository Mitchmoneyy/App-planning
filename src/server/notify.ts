/**
 * Delivers notifications: always in the app, and (if the person opted in)
 * by email and push.
 *
 * - Email: Resend (RESEND_API_KEY + EMAIL_FROM). At most one email per hour
 *   per person, so a busy prayer request doesn't flood their inbox.
 * - Web push: VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY).
 * - Phone push: Expo push service (tokens registered by the mobile app).
 *
 * Delivery failures are logged and never block the action that caused them.
 */
import "server-only";
import webpush from "web-push";
import { getStore, type NotificationRecord } from "./db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const HOUR = 60 * 60 * 1000;

let vapidReady: boolean | null = null;
function webPushReady() {
  if (vapidReady === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    vapidReady = Boolean(pub && priv);
    if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_FROM_ADDRESS || "admin@example.com"}`, pub!, priv!);
  }
  return vapidReady;
}

export const pushConfigured = () => webPushReady();
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function notify(userId: string, n: Omit<NotificationRecord, "id" | "userId" | "createdAt" | "readAt">) {
  const store = getStore();
  await store.createNotification({ ...n, userId });

  const settings = await store.getSettings(userId);
  const tasks: Promise<unknown>[] = [];

  if (settings.push) tasks.push(sendPush(userId, n.title, n.body, n.link));

  if (settings.email && emailConfigured() && (!settings.lastEmailAt || Date.now() - Date.parse(settings.lastEmailAt) > HOUR)) {
    const user = await store.getUserById(userId);
    if (user) {
      tasks.push(sendEmail(user.email, n.title, n.body, n.link));
      await store.saveSettings({ ...settings, lastEmailAt: new Date().toISOString() });
    }
  }

  await Promise.allSettled(tasks);
}

async function sendPush(userId: string, title: string, body: string, link: string | null) {
  const store = getStore();
  const subs = await store.listPushSubscriptions(userId);
  const url = link ? new URL(link, SITE_URL).toString() : SITE_URL;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        if (sub.kind === "web") {
          if (!webPushReady() || !sub.keys) return;
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: JSON.parse(sub.keys) }, JSON.stringify({ title, body, url }), { TTL: 24 * 3600 });
        } else {
          const res = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ to: sub.endpoint, title, body, data: { url: link ?? "/" }, sound: "default" }),
            signal: AbortSignal.timeout(8000),
          });
          const data = (await res.json().catch(() => null)) as { data?: { status?: string; details?: { error?: string } } } | null;
          if (data?.data?.details?.error === "DeviceNotRegistered") await store.deletePushSubscription(sub.endpoint);
        }
      } catch (err) {
        // 404/410 = the browser unsubscribed: forget this endpoint.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await store.deletePushSubscription(sub.endpoint);
        else console.error("Push failed", err);
      }
    }),
  );
}

async function sendEmail(to: string, title: string, body: string, link: string | null) {
  const url = link ? new URL(link, SITE_URL).toString() : SITE_URL;
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:24px;color:#1f2433">
    <p style="font-size:13px;color:#8a5a14;letter-spacing:.08em;text-transform:uppercase">Global Sanctuary</p>
    <h1 style="font-weight:400;font-size:24px">${escapeHtml(title)}</h1>
    <p style="font-size:16px;line-height:1.6">${escapeHtml(body)}</p>
    <p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#d9b26f;color:#1a1406;text-decoration:none">Open Global Sanctuary</a></p>
    <p style="font-size:12px;color:#5d6475">You're receiving this because you turned on email notifications. You can turn them off in My sanctuary.</p>
  </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: title, html, text: `${title}\n\n${body}\n\n${url}` }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text());
  } catch (err) {
    console.error("Email failed", err);
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
