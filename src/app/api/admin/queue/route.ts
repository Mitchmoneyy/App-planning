// GET /api/admin/queue — prayers and reviews waiting for a moderator (ADMIN_EMAILS only).
import { getStore } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { getIdentity, handle, privateJson } from "@/server/http";
import { getPlace } from "@/lib/places.server";

export const GET = handle(async () => {
  await requireAdmin(await getIdentity());
  const { prayers, reviews } = await getStore().listModerationQueue();
  const placeName = (id: string) => getPlace(id)?.name ?? id;
  return privateJson({
    prayers: prayers.map((p) => ({
      id: p.id,
      placeId: p.placeId,
      placeName: placeName(p.placeId),
      body: p.body, // only public prayers can be pending/hidden, so never encrypted
      status: p.status,
      note: p.moderationNote,
      reports: p.reportCount,
      createdAt: p.createdAt,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      placeId: r.placeId,
      placeName: placeName(r.placeId),
      body: r.body,
      rating: r.rating,
      name: r.displayName,
      status: r.status,
      note: r.moderationNote,
      createdAt: r.updatedAt,
    })),
  });
});
