import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ok } from "../http/respond";
import { parse } from "../http/validate";
import { emailSchema } from "../auth/service";
import { Errors } from "../http/errors";

const emailField = emailSchema.pipe(z.string()); // reuse normalisation

export async function systemRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Liveness: no dependencies, no information.
  app.get("/api/health", async () => ok({ status: "ok" }));

  // Readiness: verifies the database, reveals nothing beyond up/down.
  app.get("/api/ready", async () => {
    await ctx.db.ping();
    return ok({ status: "ready" });
  });

  // The ONLY configuration the browser ever receives. Explicit allow-list, no secrets.
  app.get("/api/config/public", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    const l = ctx.config.legal;
    return ok({
      legal: {
        companyName: l.companyName,
        companyAddress: l.companyAddress,
        registrationNumber: l.registrationNumber,
        contactEmail: l.contactEmail,
        supportEmail: l.supportEmail,
        privacyEmail: l.privacyEmail,
        jurisdiction: l.jurisdiction,
        effectiveDate: l.effectiveDate,
        reviewed: l.reviewed,
      },
      billingEnabled: ctx.config.billing.enabled,
    });
  });

  app.post("/api/waitlist", async (req) => {
    const { email } = parse(z.strictObject({ email: emailField }), req.body);
    const ip = await ctx.limiter.hit(ctx.limiter.key("waitlist:ip", req.meta.ip), { limit: 10, windowSec: 3600 });
    const em = await ctx.limiter.hit(ctx.limiter.key("waitlist:email", email), { limit: 3, windowSec: 3600 });
    if (!ip.allowed || !em.allowed) throw Errors.rateLimited(Math.max(ip.retryAfterSec, em.retryAfterSec));
    await ctx.db.query("INSERT INTO waitlist_signups (email, created_at) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING", [email, ctx.clock.now()]);
    // Identical response whether or not the address was already on the list.
    return ok({ message: "You're on the list." });
  });
}
