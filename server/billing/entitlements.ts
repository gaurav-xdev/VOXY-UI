import type { Queryable } from "../db";
import type { AppContext } from "../context";

const LIVE = new Set(["active", "trialing"]);
/** Allowance for a delayed renewal webhook so a paying customer isn't cut off mid-renewal. */
const RENEWAL_BUFFER_MS = 2 * 86_400_000;

interface SubRow {
  plan_key: string;
  status: string;
  current_period_end: Date | null;
  past_due_since: Date | null;
}

/**
 * Pure policy: when does this subscription stop granting access?
 *  - active/trialing  → until period end (+ small renewal buffer)
 *  - past_due         → grace window from the first failed payment
 *  - everything else  → no access
 * Returns undefined for "no entitlement", otherwise the expiry (null = no expiry).
 */
export function entitlementEnd(sub: SubRow, graceDays: number, now: Date): Date | null | undefined {
  if (LIVE.has(sub.status)) {
    return sub.current_period_end ? new Date(sub.current_period_end.getTime() + RENEWAL_BUFFER_MS) : null;
  }
  if (sub.status === "past_due") {
    const since = sub.past_due_since ?? now;
    return new Date(since.getTime() + graceDays * 86_400_000);
  }
  return undefined;
}

/** Recompute a user's subscription-derived entitlements from the database. Run inside the sync transaction. */
export async function recomputeEntitlements(ctx: AppContext, q: Queryable, userId: string): Promise<void> {
  const now = ctx.clock.now();
  const subs = await q.query<SubRow>("SELECT plan_key, status, current_period_end, past_due_since FROM subscriptions WHERE user_id = $1", [userId]);
  const wanted = new Map<string, Date | null>();
  for (const s of subs.rows) {
    const end = entitlementEnd(s, ctx.config.billing.pastDueGraceDays, now);
    if (end === undefined) continue;
    if (!ctx.config.billing.plans.some((p) => p.key === s.plan_key)) continue; // unmapped price => no entitlement
    if (!wanted.has(s.plan_key)) {
      wanted.set(s.plan_key, end);
    } else {
      const current = wanted.get(s.plan_key)!; // Date | null (null = never expires)
      if (current !== null && (end === null || end > current)) wanted.set(s.plan_key, end);
    }
  }
  const keys = [...wanted.keys()];
  await q.query("DELETE FROM entitlements WHERE user_id = $1 AND source = 'subscription' AND NOT (key = ANY($2::text[]))", [userId, keys]);
  for (const [key, end] of wanted) {
    await q.query(
      `INSERT INTO entitlements (user_id, key, source, ends_at, starts_at, updated_at) VALUES ($1,$2,'subscription',$3,$4,$4)
       ON CONFLICT (user_id, key) DO UPDATE SET ends_at = EXCLUDED.ends_at, updated_at = EXCLUDED.updated_at, source = 'subscription'`,
      [userId, key, end, now],
    );
  }
}

/** Server-side entitlement check. The browser is never consulted. */
export async function hasEntitlement(ctx: AppContext, userId: string, key: string): Promise<boolean> {
  const r = await ctx.db.query("SELECT 1 FROM entitlements WHERE user_id = $1 AND key = $2 AND (ends_at IS NULL OR ends_at > $3)", [userId, key, ctx.clock.now()]);
  return r.rowCount > 0;
}

export async function listEntitlements(ctx: AppContext, userId: string): Promise<string[]> {
  const r = await ctx.db.query<{ key: string }>("SELECT key FROM entitlements WHERE user_id = $1 AND (ends_at IS NULL OR ends_at > $2) ORDER BY key", [userId, ctx.clock.now()]);
  return r.rows.map((x) => x.key);
}
