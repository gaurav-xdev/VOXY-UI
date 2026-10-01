import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, createContext } from "./app";
import { createStripeProvider } from "./billing/stripe";
import { ConfigError, loadConfig } from "./config";
import { assertSchemaCurrent, migrate } from "./db/migrate";
import { createDb } from "./db";
import { createLogger } from "./logger";
import { createMailer } from "./mail/mailer";
import { purgeExpiredSessions } from "./auth/sessions";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Fail closed: print the problems (never values) and refuse to start.
    console.error(err instanceof ConfigError ? err.message : "Invalid configuration");
    process.exit(1);
  }
  const log = createLogger(config);
  if (config.hardened && config.trustProxyHops === 0) {
    // Behind a load balancer this makes every visitor share the proxy's IP: per-IP rate limits become global and logs lose client IPs.
    log.warn("TRUST_PROXY_HOPS=0 in a hardened environment: if a reverse proxy/CDN sits in front, set the real hop count");
  }
  const db = await createDb(config);
  if (config.database.autoMigrate) {
    const applied = await migrate(db);
    if (applied.length) log.info({ applied }, "migrations applied");
  } else {
    await assertSchemaCurrent(db);
  }

  const billing = config.billing.enabled ? createStripeProvider({ secretKey: config.billing.stripeSecretKey!, webhookSecret: config.billing.webhookSecret! }) : null;
  const ctx = createContext({ config, db, log, mailer: createMailer(config, log), billing });
  const staticRoot = process.env.STATIC_ROOT ?? path.resolve(here, "../dist/client");
  const app = await buildApp(ctx, { staticRoot });

  const timers = [
    setInterval(() => void ctx.limiter.sweep().catch((err) => log.error({ err }, "rate limit sweep failed")), 3_600_000),
    setInterval(() => void purgeExpiredSessions(ctx).catch((err) => log.error({ err }, "session purge failed")), 6 * 3_600_000),
  ];
  timers.forEach((t) => t.unref());

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    try {
      await app.close();
      await ctx.idle();
      await db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => log.error({ err: reason }, "unhandled rejection"));
  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "uncaught exception");
    process.exit(1);
  });

  await app.listen({ host: config.host, port: config.port });
  log.info({ env: config.deployEnv, billing: config.billing.enabled }, "VOXY server ready");
}

main().catch((err: unknown) => {
  // Startup failure: one concise line, no stack, and never the error's message (it can embed connection details).
  const name = err instanceof Error ? err.name : "Error";
  console.error(JSON.stringify({ level: "fatal", msg: "VOXY failed to start", error: name, hint: "check DATABASE_URL reachability, credentials and migrations" }));
  process.exit(1);
});
