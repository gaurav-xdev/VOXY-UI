import type { Logger } from "pino";
import type { AppConfig } from "./config";
import type { Db } from "./db";
import type { Mailer } from "./mail/mailer";
import type { BillingProvider } from "./billing/provider";
import type { Clock, RateLimiter } from "./security/ratelimit";

/** Everything a request handler is allowed to touch. Built once at boot (see app.ts). */
export interface AppContext {
  config: AppConfig;
  db: Db;
  log: Logger;
  mailer: Mailer;
  billing: BillingProvider | null;
  limiter: RateLimiter;
  clock: Clock;
  /** Run non-critical work (email) off the request path; failures are logged, never thrown. */
  background(label: string, fn: () => Promise<void>): void;
  /** Resolves once all background work has settled (tests + graceful shutdown). */
  idle(): Promise<void>;
}

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  requestId: string;
}
