/**
 * POST   /api/me/push — register this browser (web push subscription) or phone (Expo token)
 * DELETE /api/me/push — { endpoint } stop sending to it
 */
import { getStore } from "@/server/db";
import { requireUser } from "@/server/auth";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser(await getIdentity());
  const body = await readJson<{ kind?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; token?: string }>(req);
  const store = getStore();

  if (body.kind === "web") {
    const sub = body.subscription;
    if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) throw new HttpError(400, "Invalid subscription.");
    await store.addPushSubscription({ userId: user.id, kind: "web", endpoint: sub.endpoint, keys: JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }) });
  } else if (body.kind === "expo") {
    if (!body.token || !/^Expo(nent)?PushToken\[[\w-]+\]$/.test(body.token)) throw new HttpError(400, "Invalid token.");
    await store.addPushSubscription({ userId: user.id, kind: "expo", endpoint: body.token, keys: null });
  } else {
    throw new HttpError(400, "Invalid request.");
  }

  await store.saveSettings({ ...(await store.getSettings(user.id)), push: true });
  return privateJson({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser(await getIdentity());
  const { endpoint } = await readJson<{ endpoint?: string }>(req);
  const store = getStore();
  const mine = await store.listPushSubscriptions(user.id);
  if (endpoint && mine.some((s) => s.endpoint === endpoint)) await store.deletePushSubscription(endpoint);
  return privateJson({ ok: true });
});
