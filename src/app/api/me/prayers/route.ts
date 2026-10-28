// GET /api/me/prayers — my prayer history (private ones included, only for me).
import { getStore } from "@/server/db";
import { getIdentity, handle, privateJson } from "@/server/http";
import { toOwnPrayer } from "@/server/views";

export const GET = handle(async () => {
  const who = await getIdentity();
  const prayers = await getStore().listOwnPrayers(who);
  return privateJson({ prayers: prayers.map(toOwnPrayer) });
});
