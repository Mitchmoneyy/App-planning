/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Good enough for one server; on a multi-instance deployment each instance
 * counts separately, which still blunts abuse. Swap for a shared store
 * (e.g. Upstash Redis) if that ever becomes a problem.
 */
import "server-only";

const hits = new Map<string, number[]>();

/** Returns true if allowed (and records the hit), false if over the limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Keep memory bounded.
  if (hits.size > 50_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
