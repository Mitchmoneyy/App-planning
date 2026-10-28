/**
 * GET  /api/world/prayers?cityId=…|cc=…&before=… — recent prayers (optionally for one area)
 * POST /api/world/prayers — send a prayer or blessing to a city or country (no account needed)
 */
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { ownsWorldPrayer, toWorldPrayerView } from "@/server/views";
import { blockedBy, notifyArea, prepareWorldPrayer, type SendInput } from "@/server/world";

const PAGE = 30;

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const cityId = url.searchParams.get("cityId");
  const cc = url.searchParams.get("cc");
  const before = url.searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) throw new HttpError(400, "Invalid cursor.");

  const who = await getIdentity();
  const prayers = await getStore().listWorldPrayers({
    limit: PAGE,
    before,
    targetCityId: cityId && /^\d+$/.test(cityId) ? Number(cityId) : undefined,
    targetCc: cc && /^[A-Z]{2}$/i.test(cc) ? cc.toUpperCase() : undefined,
    excludeActors: await blockedBy(who),
  });
  return privateJson({
    prayers: prayers.map((p) => toWorldPrayerView(p, ownsWorldPrayer(p, who))),
    nextCursor: prayers.length === PAGE ? prayers[prayers.length - 1].createdAt : null,
  });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  if (!rateLimit(`world:${actorKey(who)}`, 10, 10 * 60 * 1000) || !rateLimit(`world-ip:${clientIp(req)}`, 60, 60 * 60 * 1000)) {
    throw new HttpError(429, "You've sent many prayers just now. Please rest a moment before sending another.");
  }
  const { prayer, verdict } = await prepareWorldPrayer(await readJson<SendInput>(req), who);
  const saved = await getStore().createWorldPrayer(prayer);
  notifyArea(saved);
  return privateJson(
    {
      ok: true,
      status: saved.status,
      message: saved.status === "published" ? `Your prayer is on its way to ${saved.target.name}.` : verdict?.message,
      selfHarm: verdict?.selfHarm ?? false,
      prayer: toWorldPrayerView(saved, true),
    },
    { status: 201 },
  );
});
