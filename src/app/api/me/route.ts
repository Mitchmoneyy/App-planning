/**
 * GET    /api/me — who I am (or anonymous), my favorites, and storage status
 * DELETE /api/me — permanently delete my account and everything I've shared
 */
import { actorKey, getStore } from "@/server/db";
import { endSession, isAdmin, requireUser } from "@/server/auth";
import { assertSameOrigin, getIdentity, handle, privateJson } from "@/server/http";
import type { MeView } from "@/lib/apiTypes";

export const GET = handle(async () => {
  const who = await getIdentity();
  const store = getStore();
  const user = who.userId ? await store.getUserById(who.userId) : null;
  const me: MeView = {
    user: user ? { id: user.id, email: user.email, displayName: user.displayName, isAdmin: isAdmin(user.email) } : null,
    favorites: await store.listFavorites(actorKey(who)),
    storage: { kind: store.kind, persistent: store.persistent },
  };
  return privateJson(me);
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const user = await requireUser(who);
  await getStore().deleteUser(user.id, who.deviceId);
  await endSession();
  return privateJson({ ok: true });
});
