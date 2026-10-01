import type { SessionUser } from "../auth/sessions";

/**
 * Central authorization policy. Roles are deliberately minimal and only those the
 * product actually needs:
 *
 *   anonymous  – no session
 *   user       – authenticated account owner (can act ONLY on their own resources)
 *   admin      – operator (read users/audit, disable/enable accounts)
 *
 * A "support/operator" role was intentionally NOT created: nothing in the product needs
 * a separate, narrower privilege tier yet. Add it here (and in the DB CHECK) when it does.
 *
 * The actor is ALWAYS derived server-side from the session. Role, user id, plan and
 * entitlements supplied by the browser are never read.
 */
export type Action =
  "session:revoke" | "account:delete" | "billing:checkout" | "billing:manage" | "entitlements:read" | "admin:users:read" | "admin:users:update" | "admin:audit:read";

export interface Resource {
  ownerId?: string;
  targetUserId?: string;
}

const OWNER_ACTIONS = new Set<Action>(["session:revoke", "account:delete", "billing:manage", "entitlements:read"]);

export function can(actor: SessionUser | null, action: Action, resource: Resource = {}): boolean {
  if (!actor || actor.status !== "active") return false;
  if (OWNER_ACTIONS.has(action)) return resource.ownerId === actor.id;
  switch (action) {
    case "billing:checkout":
      return actor.emailVerified && (resource.ownerId === undefined || resource.ownerId === actor.id);
    case "admin:users:read":
    case "admin:audit:read":
      return actor.role === "admin" && actor.emailVerified;
    case "admin:users:update":
      // Admins cannot modify themselves (prevents accidental lock-out and self-escalation paths).
      return actor.role === "admin" && actor.emailVerified && resource.targetUserId !== undefined && resource.targetUserId !== actor.id;
    default:
      return false;
  }
}
