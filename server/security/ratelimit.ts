import type { Queryable } from "../db";
import { hmac } from "./crypto";

export interface RateRule {
  limit: number;
  windowSec: number;
}
export interface RateResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSec: number;
}

export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

/**
 * Fixed-window counters stored in PostgreSQL so limits hold across multiple server
 * instances. Keys are HMAC-pseudonymised: raw IPs / emails are never stored in this table.
 */
export class RateLimiter {
  constructor(
    private readonly db: Queryable,
    private readonly secret: string,
    private readonly clock: Clock = systemClock,
  ) {}

  key(scope: string, ...parts: string[]): string {
    return `${scope}:${hmac(this.secret, parts.join("|")).slice(0, 32)}`;
  }

  /** Count one event and report whether it is within the limit. */
  async hit(key: string, rule: RateRule): Promise<RateResult> {
    const now = this.clock.now();
    const r = await this.db.query<{ count: number; window_start: Date }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start <= $2::timestamptz - make_interval(secs => $3) THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= $2::timestamptz - make_interval(secs => $3) THEN $2::timestamptz ELSE rate_limits.window_start END
       RETURNING count, window_start`,
      [key, now, rule.windowSec],
    );
    return this.result(r.rows[0]!, rule, now);
  }

  /** Give back one reserved attempt (used when an attempt turns out to be legitimate). */
  async release(key: string): Promise<void> {
    await this.db.query("UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1", [key]);
  }

  async reset(key: string): Promise<void> {
    await this.db.query("DELETE FROM rate_limits WHERE key = $1", [key]);
  }

  async sweep(olderThanSec = 86_400): Promise<void> {
    await this.db.query("DELETE FROM rate_limits WHERE window_start < $1", [new Date(this.clock.now().getTime() - olderThanSec * 1000)]);
  }

  private result(row: { count: number; window_start: Date }, rule: RateRule, now: Date): RateResult {
    const count = Number(row.count);
    const resetAt = row.window_start.getTime() + rule.windowSec * 1000;
    return { allowed: count <= rule.limit, count, remaining: Math.max(0, rule.limit - count), retryAfterSec: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)) };
  }
}

/** Cheap in-process limiter for the global per-IP request budget (hot path, no DB round trip). */
export class MemoryLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly rule: RateRule,
    private readonly maxKeys = 50_000,
  ) {}

  hit(key: string, nowMs = Date.now()): RateResult {
    const w = this.rule.windowSec * 1000;
    let e = this.hits.get(key);
    if (!e || nowMs - e.start >= w) {
      if (this.hits.size >= this.maxKeys) this.sweep(nowMs);
      if (this.hits.size >= this.maxKeys) this.hits.clear(); // bounded memory under attack
      e = { start: nowMs, count: 0 };
      this.hits.set(key, e);
    }
    e.count++;
    return { allowed: e.count <= this.rule.limit, count: e.count, remaining: Math.max(0, this.rule.limit - e.count), retryAfterSec: Math.ceil((e.start + w - nowMs) / 1000) };
  }

  sweep(nowMs = Date.now()): void {
    const w = this.rule.windowSec * 1000;
    for (const [k, e] of this.hits) if (nowMs - e.start >= w) this.hits.delete(k);
  }
}
