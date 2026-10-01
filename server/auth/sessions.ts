import type { Queryable } from "../db";
import type { AppContext, RequestMeta } from "../context";
import { randomToken, sha256 } from "../security/crypto";

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  status: "active" | "disabled";
  passwordChangedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  reauthenticatedAt: Date;
}

export interface AuthContext {
  user: SessionUser;
  session: SessionRecord;
}

const TOUCH_INTERVAL_MS = 60_000;
const trunc = (v: string | null, n: number) => (v ? v.slice(0, n) : null);

export async function createSession(ctx: AppContext, q: Queryable, userId: string, meta: RequestMeta): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomToken(32);
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + ctx.config.session.absoluteTtlMs);
  const r = await q.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at, reauthenticated_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $3, $4, $3, $5, $6) RETURNING id`,
    [userId, sha256(token), now, expiresAt, trunc(meta.ip, 64), trunc(meta.userAgent, 300)],
  );
  return { token, id: r.rows[0]!.id, expiresAt };
}

interface Row {
  sid: string;
  user_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  reauthenticated_at: Date;
  email: string;
  email_verified_at: Date | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  password_changed_at: Date;
}

/** Resolve a presented session token. Enforces revocation, absolute expiry, idle timeout and account status. */
export async function resolveSession(ctx: AppContext, token: string | undefined): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const now = ctx.clock.now();
  const idleCutoff = new Date(now.getTime() - ctx.config.session.idleTtlMs);
  const r = await ctx.db.query<Row>(
    `SELECT s.id AS sid, s.user_id, s.created_at, s.last_seen_at, s.expires_at, s.reauthenticated_at,
            u.email, u.email_verified_at, u.role, u.status, u.password_changed_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND s.last_seen_at > $3`,
    [sha256(token), now, idleCutoff],
  );
  const row = r.rows[0];
  if (!row || row.status !== "active") return null;
  if (now.getTime() - row.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await ctx.db.query("UPDATE sessions SET last_seen_at = $2 WHERE id = $1", [row.sid, now]);
  }
  return {
    user: { id: row.user_id, email: row.email, emailVerified: row.email_verified_at !== null, role: row.role, status: row.status, passwordChangedAt: row.password_changed_at },
    session: { id: row.sid, userId: row.user_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, reauthenticatedAt: row.reauthenticated_at },
  };
}

/** Replace the token of an existing session (session rotation on privilege change). */
export async function rotateSession(ctx: AppContext, q: Queryable, sessionId: string, opts: { reauthenticated?: boolean } = {}): Promise<string> {
  const token = randomToken(32);
  const now = ctx.clock.now();
  await q.query(`UPDATE sessions SET token_hash = $2, last_seen_at = $3, reauthenticated_at = CASE WHEN $4 THEN $3 ELSE reauthenticated_at END WHERE id = $1`, [
    sessionId,
    sha256(token),
    now,
    opts.reauthenticated ?? false,
  ]);
  return token;
}

export async function revokeSessionByToken(ctx: AppContext, q: Queryable, token: string, reason: string): Promise<void> {
  await q.query("UPDATE sessions SET revoked_at = $2, revoked_reason = $3 WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(token), ctx.clock.now(), reason]);
}

/** Ownership-scoped revoke: a user can only ever revoke their own sessions. */
export async function revokeSession(ctx: AppContext, q: Queryable, userId: string, sessionId: string, reason: string): Promise<boolean> {
  const r = await q.query("UPDATE sessions SET revoked_at = $3, revoked_reason = $4 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL", [
    sessionId,
    userId,
    ctx.clock.now(),
    reason,
  ]);
  return r.rowCount > 0;
}

export async function revokeAllSessions(ctx: AppContext, q: Queryable, userId: string, reason: string, exceptSessionId?: string): Promise<number> {
  const r = await q.query(`UPDATE sessions SET revoked_at = $2, revoked_reason = $3 WHERE user_id = $1 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid)`, [
    userId,
    ctx.clock.now(),
    reason,
    exceptSessionId ?? null,
  ]);
  return r.rowCount;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export async function listSessions(ctx: AppContext, userId: string, currentId: string): Promise<SessionSummary[]> {
  const now = ctx.clock.now();
  const idleCutoff = new Date(now.getTime() - ctx.config.session.idleTtlMs);
  const r = await ctx.db.query<{ id: string; created_at: Date; last_seen_at: Date; ip_address: string | null; user_agent: string | null }>(
    `SELECT id, created_at, last_seen_at, ip_address, user_agent FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2 AND last_seen_at > $3 ORDER BY last_seen_at DESC LIMIT 50`,
    [userId, now, idleCutoff],
  );
  return r.rows.map((s) => ({ id: s.id, createdAt: s.created_at, lastSeenAt: s.last_seen_at, ipAddress: s.ip_address, userAgent: s.user_agent, current: s.id === currentId }));
}

export async function purgeExpiredSessions(ctx: AppContext): Promise<void> {
  const cutoff = new Date(ctx.clock.now().getTime() - 7 * 86_400_000);
  await ctx.db.query("DELETE FROM sessions WHERE expires_at < $1 OR revoked_at < $1", [cutoff]);
  await ctx.db.query("DELETE FROM email_verification_tokens WHERE expires_at < $1", [cutoff]);
  await ctx.db.query("DELETE FROM password_reset_tokens WHERE expires_at < $1", [cutoff]);
}
