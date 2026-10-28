// GET /api/me/prayers — my prayer history (private ones included, only for me).
import { getStore } from "@/server/db";
import { getIdentity, handle, privateJson } from "@/server/http";
import { toOwnPrayer } from "@/server/views";
import { placeNames } from "@/lib/places.server";

export const GET = handle(async () => {
  const who = await getIdentity();
  const prayers = await getStore().listOwnPrayers(who);
  const names = await placeNames(prayers.map((p) => p.placeId));
  return privateJson({ prayers: prayers.map((p) => toOwnPrayer(p, names.get(p.placeId)!)) });
});
