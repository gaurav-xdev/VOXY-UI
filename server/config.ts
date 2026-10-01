import { z } from "zod";

/**
 * Server configuration. Everything here is SERVER-ONLY. Nothing in this file (or in
 * `process.env`) is ever bundled into the browser build; the browser only receives
 * the explicit allow-list returned by `GET /api/config/public`.
 *
 * DEPLOY_ENV separates the four environments:
 *   development | test | staging | production
 * `staging` and `production` are "hardened": missing or unsafe security configuration
 * makes the process refuse to start (fail closed).
 */

export type DeployEnv = "development" | "test" | "staging" | "production";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const planSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
  label: z.string().min(1).max(60),
  priceId: z.string().regex(/^price_[A-Za-z0-9_]+$/),
});
export type PlanConfig = z.infer<typeof planSchema>;

const envSchema = z.object({
  DEPLOY_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Number of reverse-proxy hops to trust for X-Forwarded-For. 0 = trust none. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  DATABASE_URL: z.string().default("pglite://./.data/dev"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: z.enum(["require", "disable"]).default("require"),
  AUTO_MIGRATE: bool.optional(),

  APP_SECRET: z.string().min(32).optional(),

  SESSION_ABSOLUTE_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(24 * 30),
  SESSION_IDLE_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
  REAUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(10),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("VOXY <no-reply@localhost>"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** JSON array: [{"key":"pro","label":"VOXY Pro","priceId":"price_..."}] */
  BILLING_PLANS_JSON: z.string().optional(),
  BILLING_PAST_DUE_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(3),

  LEGAL_COMPANY_NAME: z.string().max(200).optional(),
  LEGAL_COMPANY_ADDRESS: z.string().max(500).optional(),
  LEGAL_REGISTRATION_NUMBER: z.string().max(100).optional(),
  LEGAL_CONTACT_EMAIL: z.string().email().optional(),
  LEGAL_SUPPORT_EMAIL: z.string().email().optional(),
  LEGAL_PRIVACY_EMAIL: z.string().email().optional(),
  LEGAL_JURISDICTION: z.string().max(200).optional(),
  LEGAL_EFFECTIVE_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Set to "true" ONLY after the business/legal owner has reviewed the legal pages. */
  LEGAL_REVIEWED: bool.default(false),
  SECURITY_CONTACT_EMAIL: z.string().email().optional(),
});

export interface AppConfig {
  deployEnv: DeployEnv;
  hardened: boolean;
  appUrl: URL;
  host: string;
  port: number;
  logLevel: string;
  trustProxyHops: number;
  database: { url: string; poolMax: number; ssl: boolean; autoMigrate: boolean };
  appSecret: string;
  secureCookies: boolean;
  session: { absoluteTtlMs: number; idleTtlMs: number; reauthWindowMs: number };
  mail: { smtpUrl: string | null; from: string };
  billing: {
    enabled: boolean;
    stripeSecretKey: string | null;
    webhookSecret: string | null;
    plans: PlanConfig[];
    pastDueGraceDays: number;
    allowedRedirectHosts: string[];
  };
  legal: {
    companyName: string | null;
    companyAddress: string | null;
    registrationNumber: string | null;
    contactEmail: string | null;
    supportEmail: string | null;
    privacyEmail: string | null;
    jurisdiction: string | null;
    effectiveDate: string | null;
    reviewed: boolean;
  };
  securityContactEmail: string | null;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n - ${problems.join("\n - ")}`);
    this.name = "ConfigError";
  }
}

const DEV_SECRET = "development-only-secret-do-not-use-in-production-0000";

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Treat empty strings as unset so `.env` templates with blank values behave.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) cleaned[k] = v === "" ? undefined : v;

  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const e = parsed.data;
  const deployEnv = e.DEPLOY_ENV;
  const hardened = deployEnv === "staging" || deployEnv === "production";
  const problems: string[] = [];

  const appUrl = new URL(e.APP_URL);
  if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash) problems.push("APP_URL must be an origin only (no path/query/fragment)");

  let plans: PlanConfig[] = [];
  if (e.BILLING_PLANS_JSON) {
    try {
      const p = z.array(planSchema).max(10).safeParse(JSON.parse(e.BILLING_PLANS_JSON));
      if (!p.success) problems.push("BILLING_PLANS_JSON does not match [{key,label,priceId}]");
      else plans = p.data;
      if (new Set(plans.map((x) => x.key)).size !== plans.length) problems.push("BILLING_PLANS_JSON has duplicate plan keys");
    } catch {
      problems.push("BILLING_PLANS_JSON is not valid JSON");
    }
  }

  const billingEnabled = Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && plans.length > 0);
  if ((e.STRIPE_SECRET_KEY || e.STRIPE_WEBHOOK_SECRET || plans.length) && !billingEnabled) {
    problems.push("Billing is partially configured: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and BILLING_PLANS_JSON must all be set together");
  }
  if (e.STRIPE_WEBHOOK_SECRET && !e.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) problems.push("STRIPE_WEBHOOK_SECRET must start with whsec_");

  const dbIsPglite = e.DATABASE_URL.startsWith("pglite://") || e.DATABASE_URL === "memory://";
  if (!dbIsPglite && !/^postgres(ql)?:\/\//.test(e.DATABASE_URL)) problems.push("DATABASE_URL must be a postgres:// URL (or pglite:// outside staging/production)");

  if (hardened) {
    if (appUrl.protocol !== "https:") problems.push("APP_URL must use https in staging/production");
    if (!e.APP_SECRET) problems.push("APP_SECRET (>=32 chars) is required in staging/production");
    if (e.APP_SECRET === DEV_SECRET) problems.push("APP_SECRET must not be the development secret");
    if (dbIsPglite) problems.push("DATABASE_URL must point to a real PostgreSQL server in staging/production (pglite is development/test only)");
    if (!e.SMTP_URL) problems.push("SMTP_URL is required in staging/production (verification and password-reset email must be deliverable)");
    if (e.LOG_LEVEL === "debug" || e.LOG_LEVEL === "trace") problems.push("LOG_LEVEL debug/trace is not allowed in staging/production");
    if (!e.LEGAL_COMPANY_NAME || !e.LEGAL_CONTACT_EMAIL) problems.push("LEGAL_COMPANY_NAME and LEGAL_CONTACT_EMAIL are required in staging/production");
    if (/localhost|127\.0\.0\.1|example\.(com|org)/i.test(e.APP_URL)) problems.push("APP_URL must be the real public origin");
    if (billingEnabled) {
      const key = e.STRIPE_SECRET_KEY!;
      if (!/^(sk|rk)_(live|test)_/.test(key)) problems.push("STRIPE_SECRET_KEY has an unrecognised format");
      if (deployEnv === "production" && /_test_/.test(key)) problems.push("production must not use a Stripe test-mode key");
      if (deployEnv === "staging" && /_live_/.test(key)) problems.push("staging must not use a Stripe live-mode key");
    }
  }
  if (problems.length) throw new ConfigError(problems);

  return {
    deployEnv,
    hardened,
    appUrl,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    database: {
      url: e.DATABASE_URL,
      poolMax: e.DATABASE_POOL_MAX,
      ssl: e.DATABASE_SSL === "require",
      // Hardened environments migrate as an explicit release step, never implicitly on boot.
      autoMigrate: e.AUTO_MIGRATE ?? !hardened,
    },
    appSecret: e.APP_SECRET ?? DEV_SECRET,
    secureCookies: appUrl.protocol === "https:",
    session: {
      absoluteTtlMs: e.SESSION_ABSOLUTE_TTL_HOURS * 3_600_000,
      idleTtlMs: e.SESSION_IDLE_TTL_HOURS * 3_600_000,
      reauthWindowMs: e.REAUTH_WINDOW_MINUTES * 60_000,
    },
    mail: { smtpUrl: e.SMTP_URL ?? null, from: e.MAIL_FROM },
    billing: {
      enabled: billingEnabled,
      stripeSecretKey: e.STRIPE_SECRET_KEY ?? null,
      webhookSecret: e.STRIPE_WEBHOOK_SECRET ?? null,
      plans,
      pastDueGraceDays: e.BILLING_PAST_DUE_GRACE_DAYS,
      allowedRedirectHosts: ["checkout.stripe.com", "billing.stripe.com"],
    },
    legal: {
      companyName: e.LEGAL_COMPANY_NAME ?? null,
      companyAddress: e.LEGAL_COMPANY_ADDRESS ?? null,
      registrationNumber: e.LEGAL_REGISTRATION_NUMBER ?? null,
      contactEmail: e.LEGAL_CONTACT_EMAIL ?? null,
      supportEmail: e.LEGAL_SUPPORT_EMAIL ?? e.LEGAL_CONTACT_EMAIL ?? null,
      privacyEmail: e.LEGAL_PRIVACY_EMAIL ?? e.LEGAL_CONTACT_EMAIL ?? null,
      jurisdiction: e.LEGAL_JURISDICTION ?? null,
      effectiveDate: e.LEGAL_EFFECTIVE_DATE ?? null,
      reviewed: e.LEGAL_REVIEWED,
    },
    securityContactEmail: e.SECURITY_CONTACT_EMAIL ?? null,
  };
}
