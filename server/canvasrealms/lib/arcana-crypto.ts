import crypto from "node:crypto";

/**
 * AES-256-GCM helpers for encrypting Arcana OAuth tokens at rest.
 *
 * The encryption key is read from `ARCANA_TOKEN_ENCRYPTION_KEY` (base64 of
 * 32 bytes). It is loaded lazily so the module can be imported in code paths
 * that don't end up touching tokens (e.g. tests).
 *
 * Ciphertext format (single string column-friendly):
 *   v1:<base64(iv)>:<base64(ciphertext)>:<base64(authTag)>
 */

const VERSION = "v1";

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env["ARCANA_TOKEN_ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "ARCANA_TOKEN_ENCRYPTION_KEY is required to encrypt Arcana tokens",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `ARCANA_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`,
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    enc.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export function decryptToken(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("invalid Arcana token blob");
  }
  const iv = Buffer.from(parts[1]!, "base64");
  const enc = Buffer.from(parts[2]!, "base64");
  const tag = Buffer.from(parts[3]!, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString("utf8");
}

/** HMAC-SHA256 of a value with our encryption key, used for short-lived
 * signed state values during OAuth (PKCE state). */
export function signValue(value: string): string {
  return crypto
    .createHmac("sha256", getKey())
    .update(value)
    .digest("base64url");
}
