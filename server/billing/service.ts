import type { AppContext, RequestMeta } from "../context";
import type { Queryable } from "../db";
import { Errors } from "../http/errors";
import { audit } from "../events";
import { paymentFailed } from "../mail/templates";
import type { AuthContext } from "../auth/sessions";
import { can } from "../authz/policy";
import { recomputeEntitlements, listEntitlements } from "./entitlements";
import { checkoutSessionSchema, invoiceSchema, parseSubscription } from "./parse";
import { ProviderResponseError, type BillingProvider, type ProviderEvent, type ProviderSubscription } from "./provider";

const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"];

function provider(ctx: AppContext): BillingProvider {
  if (!ctx.billing || !ctx.config.billing.enabled) throw Errors.billingNotConfigured();
  return ctx.billing;
}

function assertAllowedRedirect(ctx: AppContext, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ProviderResponseError("provider returned an invalid url");
  }
  if (u.protocol !== "https:" || !ctx.config.billing.allowedRedirectHosts.includes(u.hostname)) {
    throw new ProviderResponseError("provider returned an unexpected redirect host");
  }
  return u.toString();
}

const planFor = (ctx: AppContext, priceId: string | null) => ctx.config.billing.plans.find((p) => p.priceId === priceId) ?? null;

/* ───────────────────────────── read model ───────────────────────────── */

export interface BillingSummary {
  billingEnabled: boolean;
  plans: { key: string; label: string }[];
  emailVerified: boolean;
  subscription: null | {
    planKey: string;
    planLabel: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    paymentIssue: boolean;
  };
  entitlements: string[];
}

export async function billingSummary(ctx: AppContext, auth: AuthContext): Promise<BillingSummary> {
  const userId = auth.user.id; // ALWAYS from the session
  const [subs, entitlements] = await Promise.all([
    ctx.db.query<{ plan_key: string; status: string; cancel_at_period_end: boolean; current_period_end: Date | null }>(
      `SELECT plan_key, status, cancel_at_period_end, current_period_end FROM subscriptions WHERE user_id = $1
        ORDER BY (status = ANY($2::text[])) DESC, updated_at DESC LIMIT 1`,
      [userId, LIVE_STATUSES],
    ),
    listEntitlements(ctx, userId),
  ]);
  const s = subs.rows[0];
  return {
    billingEnabled: ctx.config.billing.enabled,
    plans: ctx.config.billing.plans.map((p) => ({ key: p.key, label: p.label })),
    emailVerified: auth.user.emailVerified,
    subscription: s
      ? {
          planKey: s.plan_key,
          planLabel: ctx.config.billing.plans.find((p) => p.key === s.plan_key)?.label ?? s.plan_key,
          status: s.status,
          cancelAtPeriodEnd: s.cancel_at_period_end,
          currentPeriodEnd: s.current_period_end?.toISOString() ?? null,
          paymentIssue: s.status === "past_due" || s.status === "unpaid",
        }
      : null,
    entitlements,
  };
}

/* ───────────────────────────── user-initiated actions ───────────────────────────── */

async function getOrCreateCustomer(ctx: AppContext, p: BillingProvider, auth: AuthContext): Promise<string> {
  const existing = await ctx.db.query<{ provider_customer_id: string }>("SELECT provider_customer_id FROM billing_customers WHERE user_id = $1", [auth.user.id]);
  if (existing.rows[0]) return existing.rows[0].provider_customer_id;
  const c = await p.createCustomer({ userId: auth.user.id, email: auth.user.email });
  await ctx.db.query("INSERT INTO billing_customers (user_id, provider_customer_id) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING", [auth.user.id, c.id]);
  const row = await ctx.db.query<{ provider_customer_id: string }>("SELECT provider_customer_id FROM billing_customers WHERE user_id = $1", [auth.user.id]);
  return row.rows[0]!.provider_customer_id;
}

export async function createCheckout(ctx: AppContext, meta: RequestMeta, auth: AuthContext, planKey: string): Promise<{ url: string }> {
  const p = provider(ctx);
  if (!can(auth.user, "billing:checkout", { ownerId: auth.user.id })) throw Errors.emailNotVerified();
  // The price is resolved SERVER-SIDE from an allow-listed plan key; the client never supplies a price id.
  const plan = ctx.config.billing.plans.find((x) => x.key === planKey);
  if (!plan) throw Errors.validation({ plan: "Unknown plan." });

  const live = await ctx.db.query("SELECT 1 FROM subscriptions WHERE user_id = $1 AND status = ANY($2::text[])", [auth.user.id, LIVE_STATUSES]);
  if (live.rowCount > 0) throw Errors.conflict("ALREADY_SUBSCRIBED", "You already have a subscription. Manage it from billing.");

  const customerId = await getOrCreateCustomer(ctx, p, auth);
  const origin = ctx.config.appUrl.origin; // redirect targets come from config, never from the request
  const s = await p.createCheckoutSession({
    customerId,
    priceId: plan.priceId,
    userId: auth.user.id,
    successUrl: `${origin}/account?checkout=success`,
    cancelUrl: `${origin}/account?checkout=cancelled`,
  });
  const url = assertAllowedRedirect(ctx, s.url);
  await audit(ctx, ctx.db, { actorUserId: auth.user.id, action: "billing.checkout_created", targetType: "plan", targetId: plan.key, requestId: meta.requestId });
  return { url };
}

export async function createPortal(ctx: AppContext, meta: RequestMeta, auth: AuthContext): Promise<{ url: string }> {
  const p = provider(ctx);
  const r = await ctx.db.query<{ provider_customer_id: string }>("SELECT provider_customer_id FROM billing_customers WHERE user_id = $1", [auth.user.id]);
  if (!r.rows[0]) throw Errors.conflict("NO_BILLING_ACCOUNT", "There is no billing account yet.");
  const s = await p.createPortalSession({ customerId: r.rows[0].provider_customer_id, returnUrl: `${ctx.config.appUrl.origin}/account` });
  const url = assertAllowedRedirect(ctx, s.url);
  await audit(ctx, ctx.db, { actorUserId: auth.user.id, action: "billing.portal_opened", requestId: meta.requestId });
  return { url };
}

export async function setCancellation(ctx: AppContext, meta: RequestMeta, auth: AuthContext, cancel: boolean): Promise<void> {
  const p = provider(ctx);
  // Ownership enforced in SQL: only the caller's own subscription can ever be selected.
  const r = await ctx.db.query<{ provider_subscription_id: string; user_id: string }>(
    "SELECT provider_subscription_id, user_id FROM subscriptions WHERE user_id = $1 AND status = ANY($2::text[]) ORDER BY updated_at DESC LIMIT 1",
    [auth.user.id, LIVE_STATUSES],
  );
  const row = r.rows[0];
  if (!row || !can(auth.user, "billing:manage", { ownerId: row.user_id })) throw Errors.conflict("NO_SUBSCRIPTION", "There is no active subscription.");
  const snap = await p.setCancelAtPeriodEnd(row.provider_subscription_id, cancel);
  await ctx.db.tx(async (q) => {
    await applySubscription(ctx, q, auth.user.id, snap, ctx.clock.now());
    await recomputeEntitlements(ctx, q, auth.user.id);
    await audit(ctx, q, {
      actorUserId: auth.user.id,
      action: cancel ? "billing.cancel_requested" : "billing.cancel_reverted",
      targetType: "subscription",
      targetId: row.provider_subscription_id,
      requestId: meta.requestId,
    });
  });
}

/* ───────────────────────────── provider → database sync ───────────────────────────── */

async function applySubscription(ctx: AppContext, q: Queryable, userId: string, sub: ProviderSubscription, syncedAt: Date): Promise<boolean> {
  const plan = planFor(ctx, sub.priceId);
  if (!plan) ctx.log.warn({ event: "billing", subscription: sub.id, priceId: sub.priceId }, "subscription has a price that is not in BILLING_PLANS_JSON");
  const r = await q.query<{ id: string }>(
    `INSERT INTO subscriptions (user_id, provider_subscription_id, plan_key, provider_price_id, status, cancel_at_period_end, current_period_end, past_due_since, canceled_at, provider_synced_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $5::text = 'past_due' THEN $9::timestamptz END, $8,$9,$9,$9)
     ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
       plan_key = EXCLUDED.plan_key, provider_price_id = EXCLUDED.provider_price_id, status = EXCLUDED.status,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end, current_period_end = EXCLUDED.current_period_end,
       canceled_at = EXCLUDED.canceled_at, provider_synced_at = EXCLUDED.provider_synced_at, updated_at = EXCLUDED.updated_at,
       past_due_since = CASE WHEN EXCLUDED.status = 'past_due' THEN COALESCE(subscriptions.past_due_since, EXCLUDED.provider_synced_at) ELSE NULL END
     WHERE subscriptions.provider_synced_at <= EXCLUDED.provider_synced_at AND subscriptions.user_id = EXCLUDED.user_id
     RETURNING id`,
    [userId, sub.id, plan?.key ?? "unmapped", sub.priceId, sub.status, sub.cancelAtPeriodEnd, sub.currentPeriodEnd, sub.canceledAt, syncedAt],
  );
  return r.rowCount > 0; // false => stale (out-of-order) event ignored
}

async function userForCustomer(q: Queryable, customerId: string): Promise<string | null> {
  const r = await q.query<{ user_id: string }>("SELECT user_id FROM billing_customers WHERE provider = 'stripe' AND provider_customer_id = $1", [customerId]);
  return r.rows[0]?.user_id ?? null;
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

export async function handleWebhook(ctx: AppContext, raw: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
  const p = provider(ctx);
  const event: ProviderEvent = p.verifyWebhook(raw, signature); // throws WebhookSignatureError

  // Network call happens BEFORE the transaction so we never hold a DB transaction open on Stripe latency.
  let snapshot: ProviderSubscription | undefined;
  if (event.type === "checkout.session.completed") {
    const cs = checkoutSessionSchema.safeParse(event.object);
    if (cs.success && cs.data.mode === "subscription" && cs.data.subscription) snapshot = await p.retrieveSubscription(cs.data.subscription);
  }

  const after: Array<() => void> = [];
  const outcome = await ctx.db.tx(async (q) => {
    const ins = await q.query("INSERT INTO webhook_events (provider, event_id, type, received_at) VALUES ('stripe', $1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id", [
      event.id,
      event.type,
      ctx.clock.now(),
    ]);
    if (ins.rowCount === 0) return "duplicate" as const; // already handled (or being handled; the unique index serialises concurrent deliveries)

    let result: WebhookOutcome = "ignored";
    let detail = "ignored_type";
    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.type === "checkout.session.completed" ? snapshot : parseSubscription(event.object);
          if (!sub) {
            detail = "ignored_not_subscription";
            break;
          }
          const userId = await userForCustomer(q, sub.customerId);
          if (!userId) {
            detail = "ignored_unknown_customer";
            ctx.log.warn({ event: "billing", type: event.type, eventId: event.id }, "webhook for unknown customer");
            break;
          }
          const syncedAt = event.type === "checkout.session.completed" ? ctx.clock.now() : event.created;
          const applied = await applySubscription(ctx, q, userId, sub, syncedAt);
          await recomputeEntitlements(ctx, q, userId);
          await audit(ctx, q, {
            actorUserId: null,
            action: `billing.${event.type}`,
            targetType: "subscription",
            targetId: sub.id,
            metadata: { status: sub.status, applied, eventId: event.id, userId },
          });
          result = "processed";
          detail = applied ? "processed" : "stale_event_ignored";
          break;
        }
        case "invoice.payment_failed":
        case "invoice.paid": {
          const inv = invoiceSchema.parse(event.object);
          const customer = inv.customer ?? null;
          const userId = customer ? await userForCustomer(q, customer) : null;
          if (!userId) {
            detail = "ignored_unknown_customer";
            break;
          }
          await audit(ctx, q, { actorUserId: null, action: `billing.${event.type}`, targetType: "user", targetId: userId, metadata: { eventId: event.id } });
          if (event.type === "invoice.payment_failed") {
            const u = await q.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
            const email = u.rows[0]?.email;
            if (email) after.push(() => ctx.background("mail:payment-failed", () => ctx.mailer.send(paymentFailed(email, `${ctx.config.appUrl.origin}/account`))));
            ctx.log.warn({ event: "billing", type: "payment_failed", userId, eventId: event.id }, "billing:payment_failed");
          }
          result = "processed";
          detail = "processed";
          break;
        }
        default:
          break;
      }
    } catch (err) {
      if (err instanceof ProviderResponseError || (err as { name?: string }).name === "ZodError") {
        // Permanently malformed payload: retrying can't help. Record, alert via error log, acknowledge.
        ctx.log.error({ event: "billing", type: event.type, eventId: event.id, err: String((err as Error).message).slice(0, 200) }, "webhook payload rejected as malformed");
        detail = "rejected_malformed";
      } else {
        throw err; // transient: roll back (including the idempotency row) so the provider retries
      }
    }
    await q.query("UPDATE webhook_events SET outcome = $2 WHERE provider = 'stripe' AND event_id = $1", [event.id, detail]);
    return result;
  });
  if (outcome !== "duplicate") for (const fn of after) fn();
  ctx.log.info({ event: "billing", type: "webhook", eventType: event.type, eventId: event.id, outcome }, "billing:webhook");
  return outcome;
}
