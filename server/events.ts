import type { Queryable } from "./db";
import type { AppContext, RequestMeta } from "./context";

export type SecurityEventType =
  | "account_created"
  | "email_verified"
  | "login_succeeded"
  | "login_failed"
  | "login_blocked"
  | "login_rate_limited"
  | "login_new_ip"
  | "login_after_failures"
  | "logout"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_changed"
  | "reauthenticated"
  | "reauth_failed"
  | "session_revoked"
  | "sessions_revoked_all"
  | "account_deleted"
  | "authz_denied"
  | "csrf_rejected";

const WARN_TYPES = new Set<SecurityEventType>([
  "login_failed",
  "login_blocked",
  "login_rate_limited",
  "login_new_ip",
  "login_after_failures",
  "reauth_failed",
  "authz_denied",
  "csrf_rejected",
]);

/**
 * Persist an account security event AND emit a structured log line.
 * `metadata` must never contain secrets (passwords, tokens). Callers pass ids, not emails.
 */
export async function securityEvent(
  ctx: AppContext,
  q: Queryable,
  e: { userId: string | null; type: SecurityEventType; meta: RequestMeta; metadata?: Record<string, unknown> },
): Promise<void> {
  await q.query(`INSERT INTO security_events (user_id, type, ip_address, user_agent, request_id, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    e.userId,
    e.type,
    e.meta.ip.slice(0, 64),
    e.meta.userAgent?.slice(0, 300) ?? null,
    e.meta.requestId,
    JSON.stringify(e.metadata ?? {}),
    ctx.clock.now(),
  ]);
  ctx.log[WARN_TYPES.has(e.type) ? "warn" : "info"](
    { event: "security", type: e.type, userId: e.userId, requestId: e.meta.requestId, ip: e.meta.ip, ...e.metadata },
    `security:${e.type}`,
  );
}

export async function audit(
  ctx: AppContext,
  q: Queryable,
  e: { actorUserId: string | null; action: string; targetType?: string; targetId?: string; requestId?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await q.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    e.actorUserId,
    e.action,
    e.targetType ?? null,
    e.targetId ?? null,
    e.requestId ?? null,
    JSON.stringify(e.metadata ?? {}),
    ctx.clock.now(),
  ]);
  ctx.log.info({ event: "audit", action: e.action, actor: e.actorUserId, targetType: e.targetType, targetId: e.targetId, requestId: e.requestId }, `audit:${e.action}`);
}
