/** Account helpers used by the auth and "me" routes. */
import "server-only";
import { getStore, type Identity, type UserRecord } from "./db";
import { clearSessionCookie, HttpError, setSessionCookie, SESSION_COOKIE } from "./http";
import { hashToken, newToken } from "./security";
import { cookies } from "next/headers";

const SESSION_DAYS = 30;

/** Emails listed in ADMIN_EMAILS (comma-separated) can use the moderation page. */
export const isAdmin = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export const normalizeEmail = (email: unknown) => (typeof email === "string" ? email.trim().toLowerCase() : "");
export const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Creates a session, sets the cookie, and moves this device's activity onto the account. */
export async function startSession(user: UserRecord, who: Identity) {
  const store = getStore();
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await store.createSession(hashToken(token), user.id, expires);
  await setSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  await store.mergeDeviceIntoUser(who.deviceId, user.id);
}

export async function endSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await getStore().deleteSession(hashToken(token));
  await clearSessionCookie();
}

export async function requireUser(who: Identity): Promise<UserRecord> {
  const user = who.userId ? await getStore().getUserById(who.userId) : null;
  if (!user) throw new HttpError(401, "Please sign in first.");
  return user;
}

export async function requireAdmin(who: Identity): Promise<UserRecord> {
  const user = await requireUser(who);
  if (!isAdmin(user.email)) throw new HttpError(403, "Moderators only.");
  return user;
}
