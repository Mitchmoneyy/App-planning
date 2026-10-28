/**
 * Small security helpers: password hashing, session tokens, and encryption of
 * private prayers. Uses only Node's built-in crypto.
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** "scrypt$<salt>$<hash>" (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

/** Random token for the session cookie; only its hash is stored. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

// --- Private prayer encryption (AES-256-GCM) --------------------------------

const PREFIX = "enc:v1:";

function encryptionKey(): Buffer | null {
  const raw = process.env.PRAYER_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PRAYER_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return key;
}

/** Encrypts when a key is configured; otherwise returns the text unchanged. */
export function sealText(text: string): string {
  const key = encryptionKey();
  if (!key) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(":");
}

export function openText(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = encryptionKey();
  if (!key) return "(This prayer is encrypted and the key isn't configured.)";
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
