/**
 * Picks the storage back end: Postgres when DATABASE_URL is set, otherwise
 * the built-in development store (saved to .data/db.json).
 */
import "server-only";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { Store } from "./types";

// Survive hot reloads in development by stashing the instance on globalThis.
const globalForStore = globalThis as unknown as { __gsStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__gsStore) {
    const url = process.env.DATABASE_URL;
    globalForStore.__gsStore = url ? new PostgresStore(url) : new MemoryStore();
    if (!url && process.env.NODE_ENV === "production") {
      console.warn("DATABASE_URL is not set: using the built-in demo store. Set it for real use.");
    }
  }
  return globalForStore.__gsStore;
}

export * from "./types";
