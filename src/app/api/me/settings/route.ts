/**
 * GET /api/me/settings — home area and notification choices
 * PUT /api/me/settings — update them (account required)
 */
import { getStore } from "@/server/db";
import { requireUser } from "@/server/auth";
import { resolveArea } from "@/server/geo";
import { assertSameOrigin, getIdentity, handle, privateJson, readJson } from "@/server/http";
import { emailConfigured, pushConfigured } from "@/server/notify";
import { toAreaView } from "@/server/views";
import type { SettingsView } from "@/lib/apiTypes";

async function view(userId: string): Promise<SettingsView> {
  const s = await getStore().getSettings(userId);
  return {
    home: s.home ? toAreaView(s.home) : null,
    notifyRequests: s.notifyRequests,
    notifyArea: s.notifyArea,
    email: s.email,
    push: s.push,
    available: {
      email: emailConfigured(),
      webPush: pushConfigured(),
      vapidPublicKey: pushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null,
    },
  };
}

export const GET = handle(async () => {
  const user = await requireUser(await getIdentity());
  return privateJson(await view(user.id));
});

export const PUT = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser(await getIdentity());
  const body = await readJson<{ home?: unknown; notifyRequests?: unknown; notifyArea?: unknown; email?: unknown; push?: unknown }>(req);
  const store = getStore();
  const current = await store.getSettings(user.id);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  await store.saveSettings({
    ...current,
    home: body.home === null ? null : body.home !== undefined ? resolveArea(body.home) : current.home,
    notifyRequests: bool(body.notifyRequests, current.notifyRequests),
    notifyArea: bool(body.notifyArea, current.notifyArea),
    email: bool(body.email, current.email),
    push: bool(body.push, current.push),
  });
  return privateJson(await view(user.id));
});
