import { hash, verify, type Algorithm } from "@node-rs/argon2";

/**
 * Argon2id with the OWASP Password Storage Cheat Sheet minimum profile
 * (m=19 MiB, t=2, p=1). Salt is generated per hash by the library.
 */
const PARAMS = { algorithm: 2 as Algorithm /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Small deny-list of the most common passwords that satisfy the length rule. Length-based
// policy per NIST SP 800-63B (no composition rules); this is not a substitute for a
// breached-password check, which can be added via a k-anonymity API.
const COMMON = new Set([
  "password1234",
  "passwordpassword",
  "123456789012",
  "1234567890123",
  "qwertyuiop12",
  "qwertyuiopasdf",
  "iloveyou1234",
  "letmein12345",
  "administrator",
  "welcome12345",
  "correcthorse",
  "abcdefghijkl",
  "000000000000",
  "111111111111",
  "changeme1234",
  "password12345",
  "p@ssw0rd1234",
  "voxyvoxyvoxy",
]);

export function passwordProblem(password: string, email?: string): string | null {
  const p = password.normalize("NFKC");
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (COMMON.has(p.toLowerCase())) return "That password is too common.";
  if (/^(.)\1+$/.test(p)) return "That password is too repetitive.";
  if (email) {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    if (local.length >= 4 && p.toLowerCase().includes(local)) return "Don't include your email name in your password.";
  }
  return null;
}

export const hashPassword = (password: string): Promise<string> => hash(password.normalize("NFKC"), PARAMS);

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password.normalize("NFKC"));
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/**
 * Verify against a dummy hash so that "unknown account" and "wrong password" take the
 * same time (mitigates account enumeration via timing).
 */
export async function verifyDummy(password: string): Promise<false> {
  dummy ??= hashPassword("voxy-dummy-password-for-timing-equalisation");
  await verifyPassword(await dummy, password);
  return false;
}
