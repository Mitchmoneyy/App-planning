// POST /api/auth/signup — create an account { email, password, displayName }.
import { DuplicateError, getStore } from "@/server/db";
import { normalizeEmail, startSession, validEmail } from "@/server/auth";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { cleanText } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";
import { hashPassword } from "@/server/security";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if (!rateLimit(`signup-ip:${clientIp(req)}`, 10, 60 * 60 * 1000)) throw new HttpError(429, "Too many attempts. Please try later.");

  const body = await readJson<{ email?: unknown; password?: unknown; displayName?: unknown }>(req);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = cleanText(body.displayName).slice(0, 40);

  if (!validEmail(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (password.length < 8) throw new HttpError(400, "Please use a password of at least 8 characters.");
  if (password.length > 200) throw new HttpError(400, "That password is too long.");
  if (displayName.length < 1) throw new HttpError(400, "Please tell us what to call you.");

  const who = await getIdentity();
  try {
    const user = await getStore().createUser({ email, displayName, passwordHash: await hashPassword(password) });
    await startSession(user, who);
    return privateJson({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateError) throw new HttpError(409, "An account with this email already exists. Try signing in.");
    throw err;
  }
});
