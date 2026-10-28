/**
 * GET /api/world/area?cityId=…|cc=… — "Prayers for your area": prayers sent to
 * this city and its country, and where in the world they came from.
 */
import { countryName } from "@/lib/cities";
import { getStore } from "@/server/db";
import { resolveArea } from "@/server/geo";
import { getIdentity, handle, privateJson } from "@/server/http";
import { ownsWorldPrayer, toAreaView, toWorldPrayerView } from "@/server/views";
import { blockedBy } from "@/server/world";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const cityId = url.searchParams.get("cityId");
  const cc = url.searchParams.get("cc");
  const area = resolveArea(cityId ? { cityId: Number(cityId) } : { cc });

  const who = await getIdentity();
  const store = getStore();
  const excludeActors = await blockedBy(who);
  const [summary, toCity, toCountry, requests] = await Promise.all([
    store.areaSummary(area!.cityId, area!.cc),
    area!.cityId !== null ? store.listWorldPrayers({ limit: 30, targetCityId: area!.cityId, excludeActors }) : Promise.resolve([]),
    store.listWorldPrayers({ limit: 30, targetCc: area!.cc, excludeActors }),
    store.listPublicRequests({ limit: 10, cc: area!.cc, excludeActors }),
  ]);

  return privateJson({
    area: toAreaView(area!),
    summary: {
      ...summary,
      fromCountries: summary.fromCountries.map((c) => ({ ...c, name: countryName(c.cc) })),
    },
    cityPrayers: toCity.map((p) => toWorldPrayerView(p, ownsWorldPrayer(p, who))),
    countryPrayers: toCountry.map((p) => toWorldPrayerView(p, ownsWorldPrayer(p, who))),
    requestCount: requests.length,
  });
});
