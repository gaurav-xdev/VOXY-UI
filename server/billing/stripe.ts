import Stripe from "stripe";
import { ProviderResponseError, WebhookSignatureError, type BillingProvider, type ProviderEvent, type ProviderSubscription } from "./provider";
import { parseSubscription } from "./parse";

/**
 * Stripe adapter. Uses the SDK's pinned default API version, a hard request timeout and
 * bounded automatic retries (the SDK attaches idempotency keys to retried POSTs).
 * Hosted Checkout + Billing Portal are used so card data never touches VOXY servers.
 */
export function createStripeProvider(opts: { secretKey: string; webhookSecret: string }): BillingProvider {
  const stripe = new Stripe(opts.secretKey, { timeout: 10_000, maxNetworkRetries: 2, appInfo: { name: "voxy-server" } });

  const url = (v: string | null | undefined): string => {
    if (!v) throw new ProviderResponseError("provider returned no url");
    return v;
  };

  return {
    async createCustomer({ userId, email }) {
      const c = await stripe.customers.create({ email, metadata: { voxy_user_id: userId } }, { idempotencyKey: `voxy-customer-${userId}` });
      return { id: c.id };
    },
    async createCheckoutSession({ customerId, priceId, userId, successUrl, cancelUrl }) {
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: { metadata: { voxy_user_id: userId } },
        allow_promotion_codes: true,
      });
      return { url: url(s.url) };
    },
    async createPortalSession({ customerId, returnUrl }) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: url(s.url) };
    },
    async setCancelAtPeriodEnd(subscriptionId, cancel): Promise<ProviderSubscription> {
      return parseSubscription(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel }));
    },
    async retrieveSubscription(subscriptionId) {
      return parseSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    },
    verifyWebhook(rawBody, signatureHeader): ProviderEvent {
      if (!signatureHeader) throw new WebhookSignatureError();
      try {
        const e = stripe.webhooks.constructEvent(rawBody, signatureHeader, opts.webhookSecret);
        return { id: e.id, type: e.type, created: new Date(e.created * 1000), object: e.data.object };
      } catch {
        throw new WebhookSignatureError();
      }
    },
  };
}
