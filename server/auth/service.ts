import { z } from "zod";
import type { AppContext, RequestMeta } from "../context";
import type { Queryable } from "../db";
import { AppError, Errors } from "../http/errors";
import * as mail from "../mail/templates";
import { hmac, randomToken, safeEqual, sha256 } from "../security/crypto";
import { hashPassword, passwordProblem, verifyDummy, verifyPassword } from "../security/password";
import type { RateRule } from "../security/ratelimit";
import { securityEvent, audit } from "../events";
import { createSession, resolveSession, revokeAllSessions, revokeSessionByToken, rotateSession, type AuthContext, type SessionUser } from "./sessions";

const HOUR = 3600;
export const LIMITS = {
  registerIp: { limit: 10, windowSec: HOUR },
  registerEmail: { limit: 5, windowSec: HOUR },
  loginIp: { limit: 40, windowSec: 15 * 60 },
  loginAcctIp: { limit: 5, windowSec: 15 * 60 },
  loginAcct: { limit: 20, windowSec: HOUR },
  forgotIp: { limit: 10, windowSec: HOUR },
  forgotEmail: { limit: 3, windowSec: HOUR },
  resendIp: { limit: 10, windowSec: HOUR },
  resendEmail: { limit: 3, windowSec: HOUR },
  resendCooldown: { limit: 1, windowSec: 60 },
  tokenIp: { limit: 30, windowSec: 15 * 60 },
  reauth: { limit: 5, windowSec: 15 * 60 },
  changePassword: { limit: 5, windowSec: 15 * 60 },
} satisfies Record<string, RateRule>;

const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;

export const emailSchema = z
  .string()
  .max(320)
  .transform((s) => s.normalize("NFKC").trim().toLowerCase())
  .pipe(
    z
      .string()
      .email()
      .max(254)
      // eslint-disable-next-line no-control-regex -- intentionally rejecting control characters in email addresses
      .refine((s) => !/[\u0000-\u001f\u007f\s]/.test(s), "invalid"),
  );

export const GENERIC_ACCEPTED = { message: "If that's possible, we've sent an email with the next steps." };

async function enforce(ctx: AppContext, key: string, rule: RateRule): Promise<void> {
  const r = await ctx.limiter.hit(key, rule);
  if (!r.allowed) throw Errors.rateLimited(r.retryAfterSec);
}

const verifyUrl = (ctx: AppContext, token: string) => `${ctx.config.appUrl.origin}/verify-email#token=${token}`;
const resetUrl = (ctx: AppContext, token: string) => `${ctx.config.appUrl.origin}/reset-password#token=${token}`;

async function issueToken(ctx: AppContext, q: Queryable, table: "email_verification_tokens" | "password_reset_tokens", userId: string, ttlMs: number): Promise<string> {
  const now = ctx.clock.now();
  // Only the newest token is valid: invalidate older outstanding ones.
  await q.query(`UPDATE ${table} SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL`, [userId, now]);
  const token = randomToken(32);
  await q.query(`INSERT INTO ${table} (user_id, token_hash, expires_at, created_at) VALUES ($1,$2,$3,$4)`, [userId, sha256(token), new Date(now.getTime() + ttlMs), now]);
  return token;
}

/** Atomically consume a single-use token. Returns the owning user id or null. */
async function consumeToken(ctx: AppContext, q: Queryable, table: "email_verification_tokens" | "password_reset_tokens", token: string): Promise<string | null> {
  const now = ctx.clock.now();
  const r = await q.query<{ user_id: string }>(`UPDATE ${table} SET consumed_at = $2 WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING user_id`, [
    sha256(token),
    now,
  ]);
  return r.rows[0]?.user_id ?? null;
}

const invalidToken = () => new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired. Please request a new one.");

/* ───────────────────────────── registration ───────────────────────────── */

export async function register(ctx: AppContext, meta: RequestMeta, input: { email: string; password: string }): Promise<void> {
  const email = input.email;
  const problem = passwordProblem(input.password, email);
  if (problem) throw Errors.validation({ password: problem });

  await enforce(ctx, ctx.limiter.key("register:ip", meta.ip), LIMITS.registerIp);
  await enforce(ctx, ctx.limiter.key("register:email", email), LIMITS.registerEmail);

  // Hash unconditionally so new and existing emails cost the same (anti-enumeration timing).
  const passwordHash = await hashPassword(input.password);

  const created = await ctx.db.tx(async (q) => {
    const r = await q.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, created_at, updated_at, password_changed_at) VALUES ($1,$2,$3,$3,$3)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, passwordHash, ctx.clock.now()],
    );
    const id = r.rows[0]?.id;
    if (!id) return null;
    await securityEvent(ctx, q, { userId: id, type: "account_created", meta });
    return { id, token: await issueToken(ctx, q, "email_verification_tokens", id, VERIFY_TTL_MS) };
  });

  if (created) {
    ctx.background("mail:verify", () => ctx.mailer.send(mail.verifyEmail(email, verifyUrl(ctx, created.token))));
    return;
  }
  // Account already exists: respond identically, and tell the real owner by email.
  ctx.background("mail:exists", async () => {
    const existing = await ctx.db.query<{ id: string; email_verified_at: Date | null }>("SELECT id, email_verified_at FROM users WHERE email = $1", [email]);
    const u = existing.rows[0];
    if (!u) return;
    const cooldown = await ctx.limiter.hit(ctx.limiter.key("register:notice", email), { limit: 1, windowSec: HOUR });
    if (!cooldown.allowed) return;
    if (!u.email_verified_at) {
      const token = await ctx.db.tx((q) => issueToken(ctx, q, "email_verification_tokens", u.id, VERIFY_TTL_MS));
      await ctx.mailer.send(mail.verifyEmail(email, verifyUrl(ctx, token)));
    } else {
      await ctx.mailer.send(mail.accountExistsNotice(email, `${ctx.config.appUrl.origin}/login`, `${ctx.config.appUrl.origin}/forgot-password`));
    }
  });
}

/* ───────────────────────────── email verification ───────────────────────────── */

export async function verifyEmailToken(ctx: AppContext, meta: RequestMeta, token: string): Promise<void> {
  await enforce(ctx, ctx.limiter.key("token:ip", meta.ip), LIMITS.tokenIp);
  await ctx.db.tx(async (q) => {
    const userId = await consumeToken(ctx, q, "email_verification_tokens", token);
    if (!userId) throw invalidToken();
    await q.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2 WHERE id = $1", [userId, ctx.clock.now()]);
    await securityEvent(ctx, q, { userId, type: "email_verified", meta });
  });
}

export async function resendVerification(ctx: AppContext, meta: RequestMeta, email: string): Promise<void> {
  await enforce(ctx, ctx.limiter.key("resend:ip", meta.ip), LIMITS.resendIp);
  await enforce(ctx, ctx.limiter.key("resend:email", email), LIMITS.resendEmail);
  ctx.background("resend-verification", async () => {
    const cooldown = await ctx.limiter.hit(ctx.limiter.key("resend:cooldown", email), LIMITS.resendCooldown);
    if (!cooldown.allowed) return;
    const r = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 AND email_verified_at IS NULL AND status = 'active'", [email]);
    const u = r.rows[0];
    if (!u) return;
    const token = await ctx.db.tx((q) => issueToken(ctx, q, "email_verification_tokens", u.id, VERIFY_TTL_MS));
    await ctx.mailer.send(mail.verifyEmail(email, verifyUrl(ctx, token)));
  });
}

/* ───────────────────────────── login ───────────────────────────── */

export const deviceSignature = (ctx: AppContext, userId: string, nonce: string, pwChangedAt: Date) =>
  hmac(ctx.config.appSecret, `device:${userId}.${nonce}.${pwChangedAt.getTime()}`);

/** Cookie value proving "this browser has completed a successful login for this account before". */
export const makeDeviceCookie = (ctx: AppContext, user: { id: string; passwordChangedAt: Date }) => {
  const nonce = randomToken(16);
  return `${user.id}.${nonce}.${deviceSignature(ctx, user.id, nonce, user.passwordChangedAt)}`;
};

function deviceCookieValid(ctx: AppContext, cookie: string | undefined, user: { id: string; password_changed_at: Date }): boolean {
  if (!cookie) return false;
  const [uid, nonce, sig] = cookie.split(".");
  if (!uid || !nonce || !sig || uid !== user.id) return false;
  return safeEqual(sig, deviceSignature(ctx, user.id, nonce, user.password_changed_at));
}

export interface LoginResult {
  user: SessionUser;
  token: string;
  expiresAt: Date;
  deviceCookie: string;
}

export async function login(
  ctx: AppContext,
  meta: RequestMeta,
  input: { email: string; password: string },
  presented: { sessionToken?: string; deviceCookie?: string },
): Promise<LoginResult> {
  const { email } = input;
  const keyIp = ctx.limiter.key("login:ip", meta.ip);
  const keyAcctIp = ctx.limiter.key("login:acct-ip", email, meta.ip);
  const keyAcct = ctx.limiter.key("login:acct", email);

  // Attempts are RESERVED atomically before any slow work (password hashing), so N parallel
  // guesses cannot all slip under the limit (check-then-act race). Successful logins give the
  // reservation back, so only failures consume the budget.
  //  - per IP: every attempt counts
  //  - per (account, IP): an attacker cannot lock the owner out from the owner's own IP
  //  - per account (all IPs): distributed-attack brake, see device-cookie exception below
  const ipHit = await ctx.limiter.hit(keyIp, LIMITS.loginIp);
  const acctIp = await ctx.limiter.hit(keyAcctIp, LIMITS.loginAcctIp);
  const acct = await ctx.limiter.hit(keyAcct, LIMITS.loginAcct);

  const found = await ctx.db.query<{ id: string; password_hash: string; status: string; password_changed_at: Date; email_verified_at: Date | null; role: "user" | "admin" }>(
    "SELECT id, password_hash, status, password_changed_at, email_verified_at, role FROM users WHERE email = $1",
    [email],
  );
  const row = found.rows[0];

  // Account-wide failure budget exhausted (distributed attack): only browsers that previously
  // logged in successfully as this account (signed device cookie) may keep trying. This stops
  // an attacker from locking the legitimate owner out, while still starving the attacker.
  const knownDevice = row ? deviceCookieValid(ctx, presented.deviceCookie, row) : false;
  if (!ipHit.allowed || !acctIp.allowed || (!acct.allowed && !knownDevice)) {
    await ctx.db.tx((q) => securityEvent(ctx, q, { userId: row?.id ?? null, type: "login_rate_limited", meta }));
    throw Errors.rateLimited(Math.max(ipHit.allowed ? 0 : ipHit.retryAfterSec, acctIp.allowed ? 0 : acctIp.retryAfterSec, acct.allowed ? 0 : acct.retryAfterSec));
  }

  const passwordOk = row ? await verifyPassword(row.password_hash, input.password) : await verifyDummy(input.password);

  if (!row || !passwordOk || row.status !== "active") {
    if (row) {
      await ctx.db.tx((q) => securityEvent(ctx, q, { userId: row.id, type: row.status === "active" ? "login_failed" : "login_blocked", meta }));
    } else {
      ctx.log.warn(
        { event: "security", type: "login_failed_unknown_account", requestId: meta.requestId, ip: meta.ip, emailHmac: hmac(ctx.config.appSecret, email).slice(0, 12) },
        "security:login_failed_unknown_account",
      );
    }
    // Identical error and status for: unknown email, wrong password, disabled account.
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.", { log: "none" });
  }

  const now = ctx.clock.now();
  const result = await ctx.db.tx(async (q) => {
    // Session fixation defence: never reuse a presented session; always mint a fresh token.
    if (presented.sessionToken) await revokeSessionByToken(ctx, q, presented.sessionToken, "replaced_by_login");
    const s = await createSession(ctx, q, row.id, meta);
    await q.query("UPDATE users SET last_login_at = $2 WHERE id = $1", [row.id, now]);

    // Suspicious-login signals (logged + stored).
    const seen = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM security_events WHERE user_id = $1 AND type = 'login_succeeded' AND ip_address = $2 AND created_at > $3`,
      [row.id, meta.ip.slice(0, 64), new Date(now.getTime() - 90 * 86_400_000)],
    );
    const anyPrior = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM security_events WHERE user_id = $1 AND type = 'login_succeeded'", [row.id]);
    if ((anyPrior.rows[0]?.n ?? 0) > 0 && (seen.rows[0]?.n ?? 0) === 0) await securityEvent(ctx, q, { userId: row.id, type: "login_new_ip", meta });
    if (acctIp.count - 1 >= 3) await securityEvent(ctx, q, { userId: row.id, type: "login_after_failures", meta, metadata: { recentFailures: acctIp.count - 1 } });
    await securityEvent(ctx, q, { userId: row.id, type: "login_succeeded", meta });
    return s;
  });
  await ctx.limiter.reset(keyAcctIp);
  await ctx.limiter.release(keyAcct);

  const user: SessionUser = { id: row.id, email, emailVerified: row.email_verified_at !== null, role: row.role, status: "active", passwordChangedAt: row.password_changed_at };
  return { user, token: result.token, expiresAt: result.expiresAt, deviceCookie: makeDeviceCookie(ctx, user) };
}

export async function logout(ctx: AppContext, meta: RequestMeta, auth: AuthContext | null, token: string | undefined): Promise<void> {
  if (!token) return;
  await ctx.db.tx(async (q) => {
    await revokeSessionByToken(ctx, q, token, "logout");
    if (auth) await securityEvent(ctx, q, { userId: auth.user.id, type: "logout", meta });
  });
}

/* ───────────────────────────── password recovery ───────────────────────────── */

export async function forgotPassword(ctx: AppContext, meta: RequestMeta, email: string): Promise<void> {
  await enforce(ctx, ctx.limiter.key("forgot:ip", meta.ip), LIMITS.forgotIp);
  await enforce(ctx, ctx.limiter.key("forgot:email", email), LIMITS.forgotEmail);
  // Always respond identically and do the real work off-path so response time doesn't reveal existence.
  ctx.background("forgot-password", async () => {
    const r = await ctx.db.query<{ id: string }>("SELECT id FROM users WHERE email = $1 AND status = 'active'", [email]);
    const u = r.rows[0];
    if (!u) return;
    const token = await ctx.db.tx(async (q) => {
      const t = await issueToken(ctx, q, "password_reset_tokens", u.id, RESET_TTL_MS);
      await securityEvent(ctx, q, { userId: u.id, type: "password_reset_requested", meta });
      return t;
    });
    await ctx.mailer.send(mail.passwordReset(email, resetUrl(ctx, token)));
  });
}

export async function resetPassword(ctx: AppContext, meta: RequestMeta, input: { token: string; password: string }): Promise<void> {
  await enforce(ctx, ctx.limiter.key("token:ip", meta.ip), LIMITS.tokenIp);
  const generic = passwordProblem(input.password);
  if (generic) throw Errors.validation({ password: generic });
  const hash = await hashPassword(input.password);

  const email = await ctx.db.tx(async (q) => {
    const userId = await consumeToken(ctx, q, "password_reset_tokens", input.token);
    if (!userId) throw invalidToken();
    const u = await q.query<{ email: string; status: string }>("SELECT email, status FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const user = u.rows[0];
    if (!user || user.status !== "active") throw invalidToken();
    const specific = passwordProblem(input.password, user.email);
    if (specific) throw Errors.validation({ password: specific }); // rolls back: token stays usable
    const now = ctx.clock.now();
    // Possession of the emailed token also proves control of the mailbox.
    await q.query("UPDATE users SET password_hash = $2, password_changed_at = $3, updated_at = $3, email_verified_at = COALESCE(email_verified_at, $3) WHERE id = $1", [
      userId,
      hash,
      now,
    ]);
    await q.query("UPDATE password_reset_tokens SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL", [userId, now]);
    const revoked = await revokeAllSessions(ctx, q, userId, "password_reset");
    await securityEvent(ctx, q, { userId, type: "password_reset_completed", meta, metadata: { sessionsRevoked: revoked } });
    return user.email;
  });
  ctx.background("mail:pw-changed", () => ctx.mailer.send(mail.passwordChanged(email)));
}

/* ───────────────────────────── authenticated account security ───────────────────────────── */

async function checkCurrentPassword(ctx: AppContext, meta: RequestMeta, auth: AuthContext, password: string, bucket: "reauth" | "changePassword"): Promise<void> {
  const key = ctx.limiter.key(`${bucket}:user`, auth.user.id);
  const reserved = await ctx.limiter.hit(key, LIMITS[bucket]); // atomic reservation (race-safe)
  if (!reserved.allowed) throw Errors.rateLimited(reserved.retryAfterSec);
  const r = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [auth.user.id]);
  const ok = r.rows[0] ? await verifyPassword(r.rows[0].password_hash, password) : false;
  if (!ok) {
    await ctx.db.tx((q) => securityEvent(ctx, q, { userId: auth.user.id, type: "reauth_failed", meta, metadata: { bucket } }));
    throw new AppError(403, "INVALID_CREDENTIALS", "That password is incorrect.", { log: "none" });
  }
  await ctx.limiter.reset(key);
}

export async function reauthenticate(ctx: AppContext, meta: RequestMeta, auth: AuthContext, password: string): Promise<{ token: string; expiresAt: Date }> {
  await checkCurrentPassword(ctx, meta, auth, password, "reauth");
  return ctx.db.tx(async (q) => {
    const token = await rotateSession(ctx, q, auth.session.id, { reauthenticated: true });
    await securityEvent(ctx, q, { userId: auth.user.id, type: "reauthenticated", meta });
    return { token, expiresAt: auth.session.expiresAt };
  });
}

export async function changePassword(
  ctx: AppContext,
  meta: RequestMeta,
  auth: AuthContext,
  input: { currentPassword: string; newPassword: string },
): Promise<{ token: string; expiresAt: Date; deviceCookie: string }> {
  await checkCurrentPassword(ctx, meta, auth, input.currentPassword, "changePassword");
  const problem = passwordProblem(input.newPassword, auth.user.email);
  if (problem) throw Errors.validation({ newPassword: problem });
  if (input.newPassword === input.currentPassword) throw Errors.validation({ newPassword: "Choose a password you haven't used for this account just now." });
  const hash = await hashPassword(input.newPassword);
  const now = ctx.clock.now();
  const out = await ctx.db.tx(async (q) => {
    await q.query("UPDATE users SET password_hash = $2, password_changed_at = $3, updated_at = $3 WHERE id = $1", [auth.user.id, hash, now]);
    const revoked = await revokeAllSessions(ctx, q, auth.user.id, "password_changed", auth.session.id);
    const token = await rotateSession(ctx, q, auth.session.id, { reauthenticated: true });
    await securityEvent(ctx, q, { userId: auth.user.id, type: "password_changed", meta, metadata: { sessionsRevoked: revoked } });
    return token;
  });
  ctx.background("mail:pw-changed", () => ctx.mailer.send(mail.passwordChanged(auth.user.email)));
  return { token: out, expiresAt: auth.session.expiresAt, deviceCookie: makeDeviceCookie(ctx, { id: auth.user.id, passwordChangedAt: now }) };
}

export async function logoutEverywhere(ctx: AppContext, meta: RequestMeta, auth: AuthContext): Promise<number> {
  return ctx.db.tx(async (q) => {
    const n = await revokeAllSessions(ctx, q, auth.user.id, "logout_everywhere");
    await securityEvent(ctx, q, { userId: auth.user.id, type: "sessions_revoked_all", meta, metadata: { count: n } });
    return n;
  });
}

export async function deleteAccount(ctx: AppContext, meta: RequestMeta, auth: AuthContext): Promise<void> {
  await ctx.db.tx(async (q) => {
    const live = await q.query("SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due','unpaid','incomplete','paused')", [auth.user.id]);
    if (live.rowCount > 0) throw Errors.conflict("ACTIVE_SUBSCRIPTION", "Cancel your subscription before deleting your account.");
    await audit(ctx, q, { actorUserId: null, action: "account.deleted", targetType: "user", targetId: auth.user.id, requestId: meta.requestId });
    await q.query("DELETE FROM users WHERE id = $1", [auth.user.id]);
  });
  ctx.log.info({ event: "security", type: "account_deleted", userId: auth.user.id, requestId: meta.requestId }, "security:account_deleted");
}

export { resolveSession };
