/** Provider-agnostic billing boundary. The Stripe adapter implements it; tests use a fake. */
export type SubscriptionStatus = "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";

export interface ProviderSubscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
}

export interface ProviderEvent {
  id: string;
  type: string;
  created: Date;
  /** Raw `data.object` — parsed defensively by the webhook handler. */
  object: unknown;
}

export class WebhookSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "WebhookSignatureError";
  }
}

/** The provider returned something we can't safely use (malformed / unexpected shape). */
export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export interface BillingProvider {
  createCustomer(input: { userId: string; email: string }): Promise<{ id: string }>;
  createCheckoutSession(input: { customerId: string; priceId: string; userId: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<ProviderSubscription>;
  retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  /** Verifies the signature over the RAW body. Throws WebhookSignatureError on failure. */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): ProviderEvent;
}
