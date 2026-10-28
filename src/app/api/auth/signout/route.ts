// POST /api/auth/signout
import { endSession } from "@/server/auth";
import { assertSameOrigin, handle, privateJson } from "@/server/http";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await endSession();
  return privateJson({ ok: true });
});
