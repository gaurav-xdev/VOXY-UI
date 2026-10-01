import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { revokeAllSessions } from "../auth/sessions";
import { audit } from "../events";
import { Errors } from "../http/errors";
import { authorize, requireAuth, requireFreshAuth } from "../http/guards";
import { ok } from "../http/respond";
import { parse } from "../http/validate";

const limitQ = z.coerce.number().int().min(1).max(100).default(25);

export async function adminRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const auth = requireAuth(ctx);
  const fresh = requireFreshAuth(ctx);

  app.get("/api/admin/users", { preHandler: auth }, async (req) => {
    await authorize(ctx, req, "admin:users:read");
    const q = parse(z.strictObject({ limit: limitQ, before: z.iso.datetime().optional() }), req.query);
    const r = await ctx.db.query<{ id: string; email: string; role: string; status: string; email_verified_at: Date | null; created_at: Date; last_login_at: Date | null }>(
      `SELECT id, email, role, status, email_verified_at, created_at, last_login_at FROM users
        WHERE ($1::timestamptz IS NULL OR created_at < $1) ORDER BY created_at DESC LIMIT $2`,
      [q.before ?? null, q.limit],
    );
    return ok({
      users: r.rows.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        emailVerified: u.email_verified_at !== null,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
    });
  });

  app.post("/api/admin/users/:id/status", { preHandler: [auth, fresh] }, async (req) => {
    const { id } = parse(z.strictObject({ id: z.uuid("Invalid id.") }), req.params);
    const { status } = parse(z.strictObject({ status: z.enum(["active", "disabled"]) }), req.body);
    await authorize(ctx, req, "admin:users:update", { targetUserId: id });
    await ctx.db.tx(async (q) => {
      const r = await q.query("UPDATE users SET status = $2, updated_at = $3 WHERE id = $1", [id, status, ctx.clock.now()]);
      if (r.rowCount === 0) throw Errors.notFound();
      if (status === "disabled") await revokeAllSessions(ctx, q, id, "disabled_by_admin");
      await audit(ctx, q, { actorUserId: req.auth!.user.id, action: `admin.user_${status}`, targetType: "user", targetId: id, requestId: req.meta.requestId });
    });
    return ok({ id, status });
  });

  app.get("/api/admin/audit", { preHandler: auth }, async (req) => {
    await authorize(ctx, req, "admin:audit:read");
    const q = parse(z.strictObject({ limit: limitQ }), req.query);
    const r = await ctx.db.query<{ id: string; actor_user_id: string | null; action: string; target_type: string | null; target_id: string | null; created_at: Date }>(
      "SELECT id, actor_user_id, action, target_type, target_id, created_at FROM audit_events ORDER BY created_at DESC LIMIT $1",
      [q.limit],
    );
    return ok({ events: r.rows.map((e) => ({ id: e.id, actor: e.actor_user_id, action: e.action, targetType: e.target_type, targetId: e.target_id, at: e.created_at })) });
  });
}
