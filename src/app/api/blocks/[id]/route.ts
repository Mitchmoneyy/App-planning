// DELETE /api/blocks/:id — unblock.
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, privateJson } from "@/server/http";

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/blocks/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  await getStore().removeBlock(actorKey(await getIdentity()), id);
  return privateJson({ ok: true });
});
