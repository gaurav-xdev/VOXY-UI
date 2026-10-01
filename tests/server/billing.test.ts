import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { hasEntitlement } from "../../server/billing/entitlements";
import { Client, PRICE, WEBHOOK_SECRET, createHarness, signedIn, userId, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const sec = (d: Date | number) => Math.floor((typeof d === "number" ? d : d.getTime()) / 1000);
let evCounter = 0;

const subscription = (customer: string, over: Record<string, unknown> = {}, id = "sub_default") => ({
  id,
  object: "subscription",
  customer,
  status: "active",
  cancel_at_period_end: false,
  canceled_at: null,
  items: { data: [{ price: { id: PRICE }, current_period_end: sec(h.clock.now()) + 30 * 86400 }] },
  ...over,
});
const event = (type: string, object: unknown, over: Record<string, unknown> = {}) => ({
  id: `evt_${++evCounter}_${Math.random().toString(36).slice(2, 8)}`,
  object: "event",
  type,
  created: sec(h.clock.now()),
  data: { object },
  ...over,
});

async function webhook(evt: unknown, opts: { secret?: string; sign?: boolean; tamper?: boolean; timestamp?: number; header?: string } = {}) {
  const payload = JSON.stringify(evt);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sign !== false)
    headers["stripe-signature"] = opts.header ?? Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET, timestamp: opts.timestamp });
  const body = opts.tamper ? payload.replace("active", "trialing") : payload;
  const r = await h.app.inject({ method: "POST", url: "/api/webhooks/stripe", headers, payload: body });
  return { status: r.statusCode, body: JSON.parse(r.body) };
}

/** Sign up, verify, start checkout (creates the billing customer), return ids. */
async function customerWithCheckout() {
  const u = await signedIn(h);
  const r = await u.client.post("/api/billing/checkout", { plan: "pro" });
  expect(r.status).toBe(200);
  const uid = await userId(h, u.email);
  const cust = (await h.ctx.db.query<{ provider_customer_id: string }>("SELECT provider_customer_id FROM billing_customers WHERE user_id=$1", [uid])).rows[0]!.provider_customer_id;
  return { ...u, uid, cust };
}

describe("checkout", () => {
  it("requires authentication, verified email, a known plan and CSRF", async () => {
    expect((await new Client(h).post("/api/billing/checkout", { plan: "pro" })).status).toBe(401);
    const unverified = await signedIn(h, { verify: false });
    const r = await unverified.client.post("/api/billing/checkout", { plan: "pro" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    const ok = await signedIn(h);
    expect((await ok.client.post("/api/billing/checkout", { plan: "enterprise" })).status).toBe(422);
    const noCsrf = await ok.client.request("POST", "/api/billing/checkout", { plan: "pro" }, {}, { csrf: false });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe("CSRF_INVALID");
  });

  it("resolves price and redirect URLs server-side; client-supplied price/redirect/user fields are rejected", async () => {
    const { client } = await signedIn(h);
    for (const extra of [{ priceId: "price_cheap" }, { successUrl: "https://evil.example/" }, { userId: "someone-else" }, { amount: 1 }]) {
      const r = await client.post("/api/billing/checkout", { plan: "pro", ...extra });
      expect(r.status).toBe(422);
    }
    h.billing.calls.length = 0;
    const r = await client.post("/api/billing/checkout", { plan: "pro" });
    expect(r.status).toBe(200);
    expect(r.body.data.url).toBe(h.billing.checkoutUrl);
    const call = h.billing.calls.find((c) => c.fn === "createCheckoutSession")!.args as any;
    expect(call.priceId).toBe(PRICE);
    expect(call.successUrl.startsWith(`${h.config.appUrl.origin}/account`)).toBe(true);
    expect(call.cancelUrl.startsWith(`${h.config.appUrl.origin}/account`)).toBe(true);
  });

  it("reuses the same billing customer across checkouts", async () => {
    const { client, uid } = await customerWithCheckout();
    await client.post("/api/billing/checkout", { plan: "pro" });
    expect((await h.ctx.db.query("SELECT 1 FROM billing_customers WHERE user_id=$1", [uid])).rowCount).toBe(1);
    expect(h.billing.calls.filter((c) => c.fn === "createCustomer" && (c.args as any).userId === uid)).toHaveLength(1);
  });

  it("never fabricates success: checkout does NOT create a subscription or entitlement", async () => {
    const { uid } = await customerWithCheckout();
    expect((await h.ctx.db.query("SELECT 1 FROM subscriptions WHERE user_id=$1", [uid])).rowCount).toBe(0);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(false);
  });

  it("degrades gracefully when the billing provider is down (safe 503 + request id, no internals)", async () => {
    const { client } = await signedIn(h);
    h.billing.failWith = Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:443 sk_test_dummy"), { name: "StripeConnectionError" });
    const r = await client.post("/api/billing/checkout", { plan: "pro" });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("BILLING_UNAVAILABLE");
    expect(r.body.error.requestId).toBeTruthy();
    expect(r.raw).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|sk_test|stack/i);
    expect(h.logs.join("")).toMatch(/billing provider failure/);
    expect((await client.post("/api/billing/checkout", { plan: "pro" })).status).toBe(200); // recovers
  });

  it("rejects a provider response that redirects somewhere unexpected", async () => {
    const { client } = await signedIn(h);
    h.billing.checkoutUrl = "https://evil.example/phish";
    const r = await client.post("/api/billing/checkout", { plan: "pro" });
    h.billing.checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_123";
    expect(r.status).toBe(503);
    expect(r.raw).not.toContain("evil.example");
  });

  it("refuses a second subscription (409) once one is live", async () => {
    const { client, cust } = await customerWithCheckout();
    await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_dup1")));
    const r = await client.post("/api/billing/checkout", { plan: "pro" });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("ALREADY_SUBSCRIBED");
  });
});

describe("webhook authenticity", () => {
  it.each([
    ["missing signature", { sign: false }],
    ["wrong secret", { secret: "whsec_attacker" }],
    ["tampered body", { tamper: true }],
    ["garbage header", { header: "t=1,v1=deadbeef" }],
    ["replayed old timestamp", { timestamp: sec(Date.now()) - 3600 }],
  ])("rejects %s with 400 and changes nothing", async (_name, opts) => {
    const { uid, cust } = await customerWithCheckout();
    const r = await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_forged")), opts);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_SIGNATURE");
    expect((await h.ctx.db.query("SELECT 1 FROM subscriptions WHERE user_id=$1", [uid])).rowCount).toBe(0);
  });

  it("is not subject to cookie/CSRF rules, but a browser cannot use it (no cors)", async () => {
    const r = await h.app.inject({ method: "OPTIONS", url: "/api/webhooks/stripe", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("subscription sync, entitlements and idempotency", () => {
  it("activates entitlement from a verified event; the BROWSER never decides", async () => {
    const { client, uid, cust } = await customerWithCheckout();
    expect((await client.get("/api/entitlements")).body.data.entitlements).toEqual([]);
    // client-side spoofing attempts
    const spoof = await client.request("GET", "/api/billing", undefined, { "x-plan": "pro", "x-entitlements": "pro", "x-is-admin": "true" });
    expect(spoof.body.data.entitlements).toEqual([]);
    expect(spoof.body.data.subscription).toBeNull();

    const r = await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_a1")));
    expect(r.status).toBe(200);
    expect(r.body.data.outcome).toBe("processed");
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
    const b = (await client.get("/api/billing")).body.data;
    expect(b.subscription).toMatchObject({ planKey: "pro", planLabel: "VOXY Pro", status: "active", cancelAtPeriodEnd: false, paymentIssue: false });
    expect(b.entitlements).toEqual(["pro"]);
  });

  it("handles both Stripe payload shapes for current_period_end (item-level and legacy subscription-level)", async () => {
    const { uid, cust } = await customerWithCheckout();
    const end = sec(h.clock.now()) + 10 * 86400;
    const legacy = subscription(cust, { current_period_end: end, items: { data: [{ price: { id: PRICE } }] } }, "sub_legacy");
    expect((await webhook(event("customer.subscription.created", legacy))).body.data.outcome).toBe("processed");
    const row = (await h.ctx.db.query<{ current_period_end: Date }>("SELECT current_period_end FROM subscriptions WHERE user_id=$1", [uid])).rows[0]!;
    expect(sec(row.current_period_end)).toBe(end);
  });

  it("duplicate events are processed once (idempotent), including concurrent deliveries", async () => {
    const { uid, cust } = await customerWithCheckout();
    const e = event("customer.subscription.created", subscription(cust, {}, "sub_idem"));
    const first = await webhook(e);
    expect(first.body.data.outcome).toBe("processed");
    const again = await webhook(e);
    expect(again.status).toBe(200);
    expect(again.body.data.outcome).toBe("duplicate");

    const e2 = event("customer.subscription.updated", subscription(cust, { cancel_at_period_end: true }, "sub_idem"));
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => webhook(e2)));
    expect(burst.filter((b) => b.body.data.outcome === "processed")).toHaveLength(1);
    expect(burst.filter((b) => b.body.data.outcome === "duplicate")).toHaveLength(4);
    const audits = await h.ctx.db.query("SELECT 1 FROM audit_events WHERE metadata->>'eventId' = $1", [e2.id]);
    expect(audits.rowCount).toBe(1);
    expect((await h.ctx.db.query("SELECT 1 FROM subscriptions WHERE user_id=$1", [uid])).rowCount).toBe(1);
  });

  it("ignores out-of-order (older) events", async () => {
    const { uid, cust } = await customerWithCheckout();
    const t = sec(h.clock.now());
    await webhook(event("customer.subscription.updated", subscription(cust, { status: "active" }, "sub_ooo"), { created: t + 100 }));
    const stale = await webhook(event("customer.subscription.updated", subscription(cust, { status: "canceled" }, "sub_ooo"), { created: t + 50 }));
    expect(stale.status).toBe(200);
    expect((await h.ctx.db.query<{ status: string }>("SELECT status FROM subscriptions WHERE user_id=$1", [uid])).rows[0]!.status).toBe("active");
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
  });

  it("payment failure: grace period, notification email, then access ends; recovery restores it", async () => {
    const { client, email, uid, cust } = await customerWithCheckout();
    const t = sec(h.clock.now());
    await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_pf"), { created: t }));
    const fail = await webhook(event("invoice.payment_failed", { customer: cust, subscription: "sub_pf" }, { created: t + 1 }));
    expect(fail.body.data.outcome).toBe("processed");
    await h.ctx.idle();
    expect(h.mailer.last(email)!.subject).toMatch(/payment failed/i);
    await webhook(event("customer.subscription.updated", subscription(cust, { status: "past_due" }, "sub_pf"), { created: t + 2 }));
    let b = (await client.get("/api/billing")).body.data;
    expect(b.subscription.paymentIssue).toBe(true);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true); // within grace
    h.clock.advance(4 * 86_400_000);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(false); // grace elapsed
    await webhook(event("customer.subscription.updated", subscription(cust, { status: "active" }, "sub_pf"), { created: sec(h.clock.now()) }));
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
    b = (await client.get("/api/billing")).body.data;
    expect(b.subscription.paymentIssue).toBe(false);
  });

  it("cancellation at period end keeps access until the period ends; deletion removes it", async () => {
    const { client, uid, cust } = await customerWithCheckout();
    const t = sec(h.clock.now());
    await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_cx"), { created: t }));
    await webhook(event("customer.subscription.updated", subscription(cust, { cancel_at_period_end: true }, "sub_cx"), { created: t + 1 }));
    expect((await client.get("/api/billing")).body.data.subscription.cancelAtPeriodEnd).toBe(true);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
    await webhook(event("customer.subscription.deleted", subscription(cust, { status: "canceled", canceled_at: t + 5 }, "sub_cx"), { created: t + 5 }));
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(false);
    expect((await client.get("/api/billing")).body.data.subscription.status).toBe("canceled");
  });

  it("a missed renewal webhook eventually expires access (no unbounded entitlement)", async () => {
    const { uid, cust } = await customerWithCheckout();
    await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_exp")));
    h.clock.advance(31 * 86_400_000);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true); // renewal buffer
    h.clock.advance(3 * 86_400_000);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(false);
  });

  it("checkout.session.completed pulls authoritative state from the provider", async () => {
    const { uid, cust } = await customerWithCheckout();
    h.billing.subs.set("sub_cs1", subscription(cust, {}, "sub_cs1") as never);
    h.billing.subs.set("sub_cs1", {
      id: "sub_cs1",
      customerId: cust,
      status: "active",
      priceId: PRICE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(h.clock.now().getTime() + 30 * 86_400_000),
      canceledAt: null,
    });
    const r = await webhook(event("checkout.session.completed", { mode: "subscription", customer: cust, subscription: "sub_cs1" }));
    expect(r.body.data.outcome).toBe("processed");
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
  });

  it("transient failure rolls back the idempotency record so the provider's retry succeeds", async () => {
    const { uid, cust } = await customerWithCheckout();
    h.billing.failWith = Object.assign(new Error("boom"), { name: "StripeAPIError" });
    const e = event("checkout.session.completed", { mode: "subscription", customer: cust, subscription: "sub_retry" });
    h.billing.subs.set("sub_retry", {
      id: "sub_retry",
      customerId: cust,
      status: "active",
      priceId: PRICE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(h.clock.now().getTime() + 86_400_000),
      canceledAt: null,
    });
    const first = await webhook(e);
    expect(first.status).toBe(503); // provider will retry
    expect((await h.ctx.db.query("SELECT 1 FROM webhook_events WHERE event_id=$1", [e.id])).rowCount).toBe(0);
    const second = await webhook(e);
    expect(second.status).toBe(200);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
  });

  it("malformed external payloads are rejected safely (200 + recorded, no state change, no crash)", async () => {
    const { uid, cust } = await customerWithCheckout();
    for (const bad of [
      { id: "sub_x", customer: cust },
      { id: "not-a-sub", customer: cust, status: "active", items: { data: [{}] } },
      "just a string",
      null,
      { id: "sub_y", customer: cust, status: "super-active", items: { data: [{}] } },
    ]) {
      const r = await webhook(event("customer.subscription.updated", bad));
      expect(r.status).toBe(200);
    }
    expect((await h.ctx.db.query("SELECT 1 FROM subscriptions WHERE user_id=$1", [uid])).rowCount).toBe(0);
    expect((await h.ctx.db.query("SELECT 1 FROM webhook_events WHERE outcome='rejected_malformed'")).rowCount).toBeGreaterThan(0);
  });

  it("ignores events for unknown customers and unrelated event types", async () => {
    const r1 = await webhook(event("customer.subscription.created", subscription("cus_unknown000000", {}, "sub_unk")));
    expect(r1.status).toBe(200);
    expect((await h.ctx.db.query("SELECT 1 FROM subscriptions WHERE provider_subscription_id='sub_unk'")).rowCount).toBe(0);
    expect((await webhook(event("charge.dispute.created", { id: "dp_1" }))).status).toBe(200);
  });

  it("a subscription cannot be re-assigned to another user via a forged customer mapping", async () => {
    const a = await customerWithCheckout();
    const b = await customerWithCheckout();
    await webhook(event("customer.subscription.created", subscription(a.cust, {}, "sub_owner")));
    await webhook(event("customer.subscription.updated", subscription(b.cust, { status: "canceled" }, "sub_owner"), { created: sec(h.clock.now()) + 10 }));
    const row = (await h.ctx.db.query<{ user_id: string; status: string }>("SELECT user_id, status FROM subscriptions WHERE provider_subscription_id='sub_owner'")).rows[0]!;
    expect(row.user_id).toBe(a.uid);
    expect(row.status).toBe("active");
  });
});

describe("cancel / resume / portal ownership", () => {
  it("cancels the caller's own subscription via the provider and syncs state", async () => {
    const { client, uid, cust } = await customerWithCheckout();
    h.billing.subs.set("sub_mine", {
      id: "sub_mine",
      customerId: cust,
      status: "active",
      priceId: PRICE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(h.clock.now().getTime() + 30 * 86_400_000),
      canceledAt: null,
    });
    await webhook(event("customer.subscription.created", subscription(cust, {}, "sub_mine")));
    const r = await client.post("/api/billing/cancel");
    expect(r.status).toBe(200);
    expect((await client.get("/api/billing")).body.data.subscription.cancelAtPeriodEnd).toBe(true);
    expect(await hasEntitlement(h.ctx, uid, "pro")).toBe(true);
    expect((await client.post("/api/billing/resume")).status).toBe(200);
    expect((await client.get("/api/billing")).body.data.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("IDOR: a user can never cancel or open the portal for someone else's subscription (ids come from the session only)", async () => {
    const victim = await customerWithCheckout();
    h.billing.subs.set("sub_victim", {
      id: "sub_victim",
      customerId: victim.cust,
      status: "active",
      priceId: PRICE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(h.clock.now().getTime() + 86_400_000),
      canceledAt: null,
    });
    await webhook(event("customer.subscription.created", subscription(victim.cust, {}, "sub_victim")));
    const attacker = await signedIn(h);
    h.billing.calls.length = 0;
    for (const body of [{}, { subscriptionId: "sub_victim" }, { userId: victim.uid }]) {
      const r = await attacker.client.post("/api/billing/cancel", body);
      expect([409, 422]).toContain(r.status);
    }
    const portal = await attacker.client.post("/api/billing/portal");
    expect(portal.status).toBe(409);
    expect(h.billing.calls.filter((c) => c.fn === "setCancelAtPeriodEnd" || c.fn === "createPortalSession")).toHaveLength(0);
    expect(
      (await h.ctx.db.query<{ cancel_at_period_end: boolean }>("SELECT cancel_at_period_end FROM subscriptions WHERE provider_subscription_id='sub_victim'")).rows[0]!
        .cancel_at_period_end,
    ).toBe(false);
  });

  it("opens the portal for the caller's own customer only", async () => {
    const { client, cust } = await customerWithCheckout();
    h.billing.calls.length = 0;
    const r = await client.post("/api/billing/portal");
    expect(r.status).toBe(200);
    expect((h.billing.calls.find((c) => c.fn === "createPortalSession")!.args as any).customerId).toBe(cust);
  });

  it("billing endpoints are rate limited", async () => {
    const { client } = await signedIn(h);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await client.post("/api/billing/checkout", { plan: "pro" })).status;
    expect(last).toBe(429);
  });
});

describe("billing not configured", () => {
  it("fails closed with an honest 503 and no fake plans", async () => {
    const off = await createHarness({ STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", BILLING_PLANS_JSON: "" });
    try {
      const { client } = await signedIn(off);
      const s = await client.get("/api/billing");
      expect(s.body.data).toMatchObject({ billingEnabled: false, plans: [], subscription: null, entitlements: [] });
      expect((await client.post("/api/billing/checkout", { plan: "pro" })).status).toBe(503);
    } finally {
      await off.close();
    }
  });
});
