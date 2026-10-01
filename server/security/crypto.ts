import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit URL-safe random token (CSPRNG). Used for sessions, email and reset tokens. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** SHA-256 hex. Tokens are high-entropy so a fast hash is appropriate (and allows indexed lookup). */
export const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");

export const hmac = (secret: string, data: string): string => createHmac("sha256", secret).update(data).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
