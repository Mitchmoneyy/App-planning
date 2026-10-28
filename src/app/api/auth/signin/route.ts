// POST /api/auth/signin — { email, password }.
import { getStore } from "@/server/db";
import { normalizeEmail, startSession } from "@/server/auth";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { hashPassword, verifyPassword } from "@/server/security";

// Compared against when the email doesn't exist, so timing doesn't reveal which emails have accounts.
const dummyHash = hashPassword("not-a-real-password");

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson<{ email?: unknown; password?: unknown }>(req);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!rateLimit(`signin-ip:${clientIp(req)}`, 20, 15 * 60 * 1000) || !rateLimit(`signin:${email}`, 8, 15 * 60 * 1000)) {
    throw new HttpError(429, "Too many attempts. Please wait 15 minutes and try again.");
  }

  const user = email ? await getStore().getUserByEmail(email) : null;
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) throw new HttpError(401, "That email and password don't match.");

  await startSession(user, await getIdentity());
  return privateJson({ ok: true });
});
