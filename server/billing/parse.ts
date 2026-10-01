import { z } from "zod";
import { ProviderResponseError, type ProviderSubscription } from "./provider";

const ts = z.number().int().nonnegative();

/**
 * Tolerant subscription parser. Stripe moved `current_period_end` from the subscription
 * to its items (API 2025-03-31+); we accept either so older webhook endpoints still work.
 * Anything unexpected is rejected instead of being trusted.
 */
const subscriptionSchema = z.object({
  id: z.string().regex(/^sub_[A-Za-z0-9_]+$/),
  customer: z.union([z.string().regex(/^cus_[A-Za-z0-9_]+$/), z.object({ id: z.string().regex(/^cus_[A-Za-z0-9_]+$/) })]),
  status: z.enum(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]),
  cancel_at_period_end: z.boolean().default(false),
  canceled_at: ts.nullable().optional(),
  current_period_end: ts.optional(),
  items: z.object({
    data: z
      .array(z.object({ price: z.object({ id: z.string() }).optional(), current_period_end: ts.optional() }))
      .min(1)
      .max(20),
  }),
});

export function parseSubscription(raw: unknown): ProviderSubscription {
  const r = subscriptionSchema.safeParse(raw);
  if (!r.success) throw new ProviderResponseError("malformed subscription payload");
  const s = r.data;
  const first = s.items.data[0]!;
  const endSec = first.current_period_end ?? s.current_period_end;
  return {
    id: s.id,
    customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    priceId: first.price?.id ?? null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    currentPeriodEnd: endSec ? new Date(endSec * 1000) : null,
    canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
  };
}

const idOf = z.union([z.string(), z.object({ id: z.string() })]).transform((v) => (typeof v === "string" ? v : v.id));

export const checkoutSessionSchema = z.object({
  mode: z.string(),
  customer: idOf.nullable().optional(),
  subscription: idOf.nullable().optional(),
});

export const invoiceSchema = z.object({
  customer: idOf.nullable().optional(),
  subscription: idOf.nullable().optional(),
  parent: z
    .object({ subscription_details: z.object({ subscription: idOf.nullable().optional() }).nullable().optional() })
    .nullable()
    .optional(),
});
