import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { buildApp, createContext } from "../../server/app";
import { loadConfig, type AppConfig } from "../../server/config";
import type { AppContext } from "../../server/context";
import { createPgliteDb } from "../../server/db/pglite";
import { migrate } from "../../server/db/migrate";
import { createLogger } from "../../server/logger";
import { OutboxMailer } from "../../server/mail/mailer";
import { createStripeProvider } from "../../server/billing/stripe";
import type { BillingProvider, ProviderSubscription } from "../../server/billing/provider";
import type { Clock } from "../../server/security/ratelimit";
import { loadMigrationsDirForTests } from "./migrations-dir";

export const ORIGIN = "https://app.voxy.test";
export const WEBHOOK_SECRET = "whsec_testsecret";
export const PRICE = "price_pro_test";
export const GOOD_PASSWORD = "correct horse battery staple 42";

export class TestClock implements Clock {
  constructor(private t = Date.now()) {}
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export class FakeBilling {
  calls: Array<{ fn: string; args: unknown }> = [];
  failWith: Error | null = null;
  checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_123";
  portalUrl = "https://billing.stripe.com/p/session/test_123";
  subs = new Map<string, ProviderSubscription>();
  private n = 0;
  private maybeFail() {
    if (this.failWith) {
      const e = this.failWith;
      this.failWith = null;
      throw e;
    }
  }
  provider(real: BillingProvider): BillingProvider {
    return {
      createCustomer: async (a) => {
        this.calls.push({ fn: "createCustomer", args: a });
        this.maybeFail();
        return { id: `cus_${a.userId.replace(/-/g, "").slice(0, 14)}` };
      },
      createCheckoutSession: async (a) => {
        this.calls.push({ fn: "createCheckoutSession", args: a });
        this.maybeFail();
        return { url: this.checkoutUrl };
      },
      createPortalSession: async (a) => {
        this.calls.push({ fn: "createPortalSession", args: a });
        this.maybeFail();
        return { url: this.portalUrl };
      },
      setCancelAtPeriodEnd: async (id, cancel) => {
        this.calls.push({ fn: "setCancelAtPeriodEnd", args: { id, cancel } });
        this.maybeFail();
        const s = this.subs.get(id);
        if (!s) throw new Error("no such sub");
        const next = { ...s, cancelAtPeriodEnd: cancel };
        this.subs.set(id, next);
        return next;
      },
      retrieveSubscription: async (id) => {
        this.calls.push({ fn: "retrieveSubscription", args: id });
        this.maybeFail();
        const s = this.subs.get(id);
        if (!s) throw new Error("no such sub");
        return s;
      },
      verifyWebhook: (raw, sig) => real.verifyWebhook(raw, sig), // REAL Stripe signature verification
    };
  }
  nextSubId() {
    return `sub_test${++this.n}`;
  }
}

export interface Harness {
  app: FastifyInstance;
  ctx: AppContext;
  mailer: OutboxMailer;
  clock: TestClock;
  billing: FakeBilling;
  config: AppConfig;
  logs: string[];
  close(): Promise<void>;
}

export async function createHarness(env: Record<string, string> = {}, build: import("../../server/app").BuildOptions = {}): Promise<Harness> {
  const config = loadConfig({
    DEPLOY_ENV: "test",
    APP_URL: ORIGIN,
    APP_SECRET: "test-secret-test-secret-test-secret-1234",
    TRUST_PROXY_HOPS: "1",
    LOG_LEVEL: "info",
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    BILLING_PLANS_JSON: JSON.stringify([{ key: "pro", label: "VOXY Pro", priceId: PRICE }]),
    LEGAL_COMPANY_NAME: "Test Co",
    LEGAL_CONTACT_EMAIL: "legal@voxy.test",
    ...env,
  });
  const logs: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk));
      cb();
    },
  });
  const log = createLogger(config, sink);
  const db = await createPgliteDb();
  await migrate(db, loadMigrationsDirForTests());
  const mailer = new OutboxMailer();
  const clock = new TestClock();
  const billing = new FakeBilling();
  const real = createStripeProvider({ secretKey: "sk_test_dummy", webhookSecret: WEBHOOK_SECRET });
  const ctx = createContext({ config, db, log, mailer, clock, billing: billing.provider(real) });
  const app = await buildApp(ctx, build);
  await app.ready();
  return {
    app,
    ctx,
    mailer,
    clock,
    billing,
    config,
    logs,
    close: async () => {
      await app.close();
      await ctx.idle();
      await db.close();
    },
  };
}

let ipCounter = 10;
export const freshIp = () => `10.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}.7`;
let emailCounter = 0;
export const freshEmail = (tag = "u") => `${tag}${++emailCounter}-${Math.random().toString(36).slice(2, 8)}@voxy.test`;

export interface Res {
  status: number;
  body: any;
  headers: Record<string, any>;
  raw: string;
}

/** Minimal browser-like client: cookie jar + CSRF token handling + per-client IP. */
export class Client {
  jar = new Map<string, string>();
  csrf: string | null = null;
  constructor(
    private h: Harness,
    public ip = freshIp(),
  ) {}

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(
    method: string,
    url: string,
    body?: unknown,
    extra: Record<string, string> = {},
    opts: { csrf?: boolean; origin?: string | null; json?: boolean } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, "user-agent": "vitest-client", ...extra };
    if (opts.json !== false && method !== "GET") headers["content-type"] = "application/json";
    if (opts.origin !== null && method !== "GET") headers.origin = opts.origin ?? ORIGIN;
    if (this.jar.size) headers.cookie = this.cookieHeader();
    if (opts.csrf !== false && this.csrf && method !== "GET") headers["x-csrf-token"] = this.csrf;
    const r = await this.h.app.inject({ method: method as "GET", url, headers, payload: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const setCookie = r.headers["set-cookie"];
    for (const c of ([] as string[]).concat((setCookie as string | string[] | undefined) ?? [])) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      const name = pair!.slice(0, idx),
        value = pair!.slice(idx + 1);
      if (value === "" || /Expires=Thu, 01 Jan 1970/i.test(c)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    let parsed: any = null;
    try {
      parsed = r.body ? JSON.parse(r.body) : null;
    } catch {
      /* non-JSON */
    }
    if (parsed?.data?.csrfToken) this.csrf = parsed.data.csrfToken;
    return { status: r.statusCode, body: parsed, headers: r.headers as Record<string, any>, raw: r.body };
  }
  get = (url: string, extra?: Record<string, string>) => this.request("GET", url, undefined, extra);
  post = (url: string, body: unknown = {}, extra?: Record<string, string>) => this.request("POST", url, body, extra);
  del = (url: string, body: unknown = {}) => this.request("DELETE", url, body);

  async refreshSession() {
    return this.get("/api/auth/session");
  }
}

export const tokenFrom = (text: string): string => {
  const m = /#token=([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error("no token in mail");
  return m[1]!;
};

/** Register + verify + login. Returns a signed-in client. */
export async function signedIn(h: Harness, opts: { email?: string; password?: string; verify?: boolean } = {}) {
  const email = opts.email ?? freshEmail();
  const password = opts.password ?? GOOD_PASSWORD;
  const c = new Client(h);
  const reg = await c.post("/api/auth/register", { email, password });
  if (reg.status !== 202) throw new Error(`register failed ${reg.status} ${reg.raw}`);
  await h.ctx.idle();
  if (opts.verify !== false) {
    const t = tokenFrom(h.mailer.last(email)!.text);
    const v = await c.post("/api/auth/verify-email", { token: t });
    if (v.status !== 200) throw new Error(`verify failed ${v.raw}`);
  }
  const l = await c.post("/api/auth/login", { email, password });
  if (l.status !== 200) throw new Error(`login failed ${l.status} ${l.raw}`);
  return { client: c, email, password };
}

export async function userId(h: Harness, email: string): Promise<string> {
  const r = await h.ctx.db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  return r.rows[0]!.id;
}

export { Stripe };
