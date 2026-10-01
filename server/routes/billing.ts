import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import * as billing from "../billing/service";
import { WebhookSignatureError } from "../billing/provider";
import { AppError, Errors } from "../http/errors";
import { authorize, requireAuth, requireVerified } from "../http/guards";
import { ok } from "../http/respond";
import { parse } from "../http/validate";
import type { RateRule } from "../security/ratelimit";

const RULES = {
  checkout: { limit: 10, windowSec: 3600 },
  portal: { limit: 20, windowSec: 3600 },
  change: { limit: 10, windowSec: 3600 },
  read: { limit: 120, windowSec: 60 },
} satisfies Record<string, RateRule>;

export async function billingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const auth = requireAuth(ctx);
  const limit = async (scope: keyof typeof RULES, userId: string) => {
    const r = await ctx.limiter.hit(ctx.limiter.key(`billing:${scope}`, userId), RULES[scope]);
    if (!r.allowed) throw Errors.rateLimited(r.retryAfterSec);
  };

  app.get("/api/billing", { preHandler: auth }, async (req) => {
    await limit("read", req.auth!.user.id);
    return ok(await billing.billingSummary(ctx, req.auth!));
  });

  app.post("/api/billing/checkout", { preHandler: [auth, requireVerified()] }, async (req) => {
    const { plan } = parse(z.strictObject({ plan: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, "Unknown plan.") }), req.body);
    await authorize(ctx, req, "billing:checkout", { ownerId: req.auth!.user.id });
    await limit("checkout", req.auth!.user.id);
    return ok(await billing.createCheckout(ctx, req.meta, req.auth!, plan));
  });

  app.post("/api/billing/portal", { preHandler: auth }, async (req) => {
    parse(z.strictObject({}), req.body);
    await limit("portal", req.auth!.user.id);
    return ok(await billing.createPortal(ctx, req.meta, req.auth!));
  });

  app.post("/api/billing/cancel", { preHandler: auth }, async (req) => {
    parse(z.strictObject({}), req.body);
    await limit("change", req.auth!.user.id);
    await billing.setCancellation(ctx, req.meta, req.auth!, true);
    return ok({ requested: true });
  });

  app.post("/api/billing/resume", { preHandler: auth }, async (req) => {
    parse(z.strictObject({}), req.body);
    await limit("change", req.auth!.user.id);
    await billing.setCancellation(ctx, req.meta, req.auth!, false);
    return ok({ resumed: true });
  });
}

/**
 * Webhook endpoint, registered in its own encapsulated scope so the raw-body parser only
 * applies here. Authenticity comes from the provider signature, not cookies/CSRF.
 */
export async function webhookRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: 1_048_576 }, (_req, body, done) => done(null, body));

  app.post("/api/webhooks/stripe", { config: { rawBody: true } }, async (req, reply) => {
    const sig = req.headers["stripe-signature"];
    try {
      const outcome = await billing.handleWebhook(ctx, req.body as Buffer, typeof sig === "string" ? sig : undefined);
      return ok({ received: true, outcome });
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        ctx.log.warn({ event: "billing", type: "webhook_signature_invalid", requestId: req.meta.requestId, ip: req.meta.ip }, "billing:webhook_signature_invalid");
        reply.code(400);
        throw new AppError(400, "INVALID_SIGNATURE", "Invalid signature.", { log: "none" });
      }
      throw err;
    }
  });
}
