/**
 * Helpers shared by the API route handlers: identity cookies, JSON responses,
 * cross-site request protection and error handling.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { getStore, type Identity } from "./db";
import { hashToken } from "./security";
import { getPlace } from "@/lib/places.server";

export const DEVICE_COOKIE = "gs_device";
export const SESSION_COOKIE = "gs_session";
const YEAR = 365 * 24 * 60 * 60;

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Thrown inside handlers to return a specific status + message. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Who is making this request. Creates the anonymous device cookie on first
 * visit, and resolves the signed-in user from the session cookie.
 */
export async function getIdentity(): Promise<Identity> {
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId || !/^[0-9a-f-]{36}$/.test(deviceId)) {
    deviceId = randomUUID();
    jar.set(DEVICE_COOKIE, deviceId, { ...cookieBase, maxAge: YEAR });
  }

  let userId: string | null = null;
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    userId = await getStore().getSessionUser(hashToken(token));
    if (!userId) jar.delete(SESSION_COOKIE); // expired or signed out elsewhere
  }
  return { deviceId, userId };
}

export async function setSessionCookie(token: string, maxAgeSeconds: number) {
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, maxAge: maxAgeSeconds });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Blocks cross-site form posts and scripted requests from other sites.
 * Browsers always send Origin on POST/PUT/DELETE; it must match our host.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked.");
    return;
  }
  // No Origin header (old browsers, tools): require JSON, which plain forms can't send.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(403, "Cross-site request blocked.");
  }
}

/** Parses a JSON body, with a size cap. */
export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 16_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "That's too long.");
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export function requirePlace(id: string) {
  const place = getPlace(id);
  if (!place) throw new HttpError(404, "We couldn't find that place.");
  return place;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * Wraps a handler: runs it only at request time (never prerendered at build),
 * turns HttpError into JSON errors, and hides internal errors.
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    await connection();
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err); // let Next.js handle its own control-flow errors
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(err);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

/** JSON response that must never be cached (per-user data). */
export const privateJson = (data: unknown, init?: ResponseInit) =>
  Response.json(data, { ...init, headers: { "Cache-Control": "private, no-store", ...init?.headers } });
