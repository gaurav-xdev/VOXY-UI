import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import * as svc from "../auth/service";
import { listSessions, revokeSession } from "../auth/sessions";
import { Errors } from "../http/errors";
import { authorize, clearSessionCookie, requireAuth, requireFreshAuth, setDeviceCookie, setSessionCookie } from "../http/guards";
import { ok } from "../http/respond";
import { parse } from "../http/validate";
import { securityEvent } from "../events";
import { listEntitlements } from "../billing/entitlements";

export async function accountRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const auth = requireAuth(ctx);
  const fresh = requireFreshAuth(ctx);

  app.get("/api/account/sessions", { preHandler: auth }, async (req) => {
    const sessions = await listSessions(ctx, req.auth!.user.id, req.auth!.session.id);
    return ok({ sessions });
  });

  app.delete("/api/account/sessions/:id", { preHandler: auth }, async (req, reply) => {
    const { id } = parse(z.strictObject({ id: z.uuid("Invalid session id.") }), req.params);
    // Ownership is enforced in SQL (user_id = caller). A foreign id is indistinguishable from a missing one.
    const revoked = await ctx.db.tx(async (q) => {
      const done = await revokeSession(ctx, q, req.auth!.user.id, id, "revoked_by_user");
      if (done) await securityEvent(ctx, q, { userId: req.auth!.user.id, type: "session_revoked", meta: req.meta });
      return done;
    });
    if (!revoked) throw Errors.notFound();
    if (id === req.auth!.session.id) clearSessionCookie(ctx, reply);
    return ok({ revoked: true });
  });

  app.get("/api/account/security-events", { preHandler: auth }, async (req) => {
    const r = await ctx.db.query<{ type: string; created_at: Date; ip_address: string | null }>(
      "SELECT type, created_at, ip_address FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
      [req.auth!.user.id],
    );
    return ok({ events: r.rows.map((e) => ({ type: e.type, at: e.created_at, ip: e.ip_address })) });
  });

  app.get("/api/entitlements", { preHandler: auth }, async (req) => {
    await authorize(ctx, req, "entitlements:read", { ownerId: req.auth!.user.id });
    return ok({ entitlements: await listEntitlements(ctx, req.auth!.user.id) });
  });

  app.post("/api/account/password", { preHandler: auth }, async (req, reply) => {
    const body = parse(z.strictObject({ currentPassword: z.string().min(1, "Enter your current password.").max(1024), newPassword: z.string().max(1024) }), req.body);
    const r = await svc.changePassword(ctx, req.meta, req.auth!, body);
    setSessionCookie(ctx, reply, r.token, r.expiresAt);
    setDeviceCookie(ctx, reply, r.deviceCookie);
    return ok({ changed: true });
  });

  app.post("/api/account/logout-everywhere", { preHandler: [auth, fresh] }, async (req, reply) => {
    const n = await svc.logoutEverywhere(ctx, req.meta, req.auth!);
    clearSessionCookie(ctx, reply);
    return ok({ revoked: n });
  });

  app.delete("/api/account", { preHandler: [auth, fresh] }, async (req, reply) => {
    parse(z.strictObject({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm." }) }), req.body);
    await authorize(ctx, req, "account:delete", { ownerId: req.auth!.user.id });
    await svc.deleteAccount(ctx, req.meta, req.auth!);
    clearSessionCookie(ctx, reply);
    return ok({ deleted: true });
  });
}
