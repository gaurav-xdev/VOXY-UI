import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { CLIENT_ROUTES } from "../shared/routes";
import type { AppConfig } from "./config";
import type { AppContext } from "./context";
import { isConnectionError, type Db } from "./db";
import { AppError } from "./http/errors";
import type { Fail } from "./http/respond";
import { registerSecurity } from "./http/security";
import type { Mailer } from "./mail/mailer";
import type { BillingProvider } from "./billing/provider";
import { ProviderResponseError } from "./billing/provider";
import { MemoryLimiter, RateLimiter, systemClock, type Clock } from "./security/ratelimit";
import { systemRoutes } from "./routes/system";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/account";
import { billingRoutes, webhookRoutes } from "./routes/billing";
import { adminRoutes } from "./routes/admin";

export interface ContextDeps {
  config: AppConfig;
  db: Db;
  log: Logger;
  mailer: Mailer;
  billing?: BillingProvider | null;
  clock?: Clock;
}

export function createContext(d: ContextDeps): AppContext {
  const clock = d.clock ?? systemClock;
  const pending = new Set<Promise<void>>();
  return {
    config: d.config,
    db: d.db,
    log: d.log,
    mailer: d.mailer,
    billing: d.billing ?? null,
    clock,
    limiter: new RateLimiter(d.db, d.config.appSecret, clock),
    background(label, fn) {
      const p = fn()
        .catch((err: unknown) => d.log.error({ err, task: label }, "background task failed"))
        .finally(() => pending.delete(p));
      pending.add(p);
    },
    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}

export interface BuildOptions {
  /** Directory holding the built client (index.html + assets). Omit in API-only tests. */
  staticRoot?: string;
  globalRateLimit?: { limit: number; windowSec: number };
  handlerTimeoutMs?: number;
}

export async function buildApp(ctx: AppContext, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: ctx.log,
    genReqId: () => randomUUID(),
    requestIdHeader: false, // never trust a client-supplied id (log injection / trace forgery)
    trustProxy: ctx.config.trustProxyHops > 0 ? (_addr: string, hop: number) => hop < ctx.config.trustProxyHops : false,
    bodyLimit: 32 * 1024,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 65_000,
    handlerTimeout: opts.handlerTimeoutMs ?? 20_000,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
    routerOptions: { maxParamLength: 200 },
  }) as unknown as FastifyInstance;

  await app.register(cookie);
  await registerSecurity(app, ctx);

  const globalLimiter = new MemoryLimiter(opts.globalRateLimit ?? { limit: 600, windowSec: 60 });
  app.decorateRequest("meta", undefined as never);
  app.decorateRequest("auth", null);
  app.decorateRequest("sessionToken", undefined);

  app.addHook("onRequest", async (req, reply) => {
    req.meta = { ip: req.ip, userAgent: (req.headers["user-agent"] ?? "").toString().slice(0, 300) || null, requestId: req.id };
    reply.header("X-Request-Id", req.id);
    if (req.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      const r = globalLimiter.hit(req.ip);
      if (!r.allowed) throw new AppError(429, "RATE_LIMITED", "Too many requests. Please slow down.", { headers: { "Retry-After": String(r.retryAfterSec) }, log: "none" });
    }
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    const requestId = req.id;
    const send = (status: number, code: string, message: string, extra: { headers?: Record<string, string>; fields?: Record<string, string> } = {}) => {
      for (const [k, v] of Object.entries(extra.headers ?? {})) reply.header(k, v);
      const body: Fail = { ok: false, error: { code, message, requestId, ...(extra.fields ? { fields: extra.fields } : {}) } };
      return reply.code(status).type("application/json; charset=utf-8").send(body);
    };

    if (err instanceof AppError) {
      const level = err.opts.log ?? (err.status >= 500 ? "error" : "none");
      if (level !== "none") req.log[level]({ err, code: err.code }, "request failed");
      return send(err.status, err.code, err.message, err.opts);
    }
    const code = (err as FastifyError).code;
    const status = (err as FastifyError).statusCode;
    if (code === "FST_ERR_HANDLER_TIMEOUT") {
      req.log.error({ err }, "handler timeout");
      return send(503, "REQUEST_TIMEOUT", "That took too long. Please try again.", { headers: { "Retry-After": "5" } });
    }
    if (isConnectionError(err)) {
      req.log.error({ err }, "database unavailable");
      return send(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly.", { headers: { "Retry-After": "5" } });
    }
    if (err instanceof ProviderResponseError || err.name.startsWith("Stripe")) {
      req.log.error({ err: { name: err.name, type: (err as { type?: string }).type, code: (err as { code?: string }).code } }, "billing provider failure");
      return send(503, "BILLING_UNAVAILABLE", "Billing is temporarily unavailable. Please try again shortly.", { headers: { "Retry-After": "10" } });
    }
    if (status === 413) return send(413, "PAYLOAD_TOO_LARGE", "The request was too large.");
    if (status === 415) return send(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
    if (status && status >= 400 && status < 500) return send(400, "BAD_REQUEST", "The request was invalid."); // malformed JSON, poisoned bodies, etc.
    // Unexpected: full detail goes to the server log only.
    req.log.error({ err }, "unhandled error");
    return send(500, "INTERNAL", "Something went wrong on our side. Please try again, and quote the reference if it persists.");
  });

  // Routes
  await app.register(async (scope) => systemRoutes(scope, ctx));
  await app.register(async (scope) => authRoutes(scope, ctx));
  await app.register(async (scope) => accountRoutes(scope, ctx));
  await app.register(async (scope) => billingRoutes(scope, ctx));
  await app.register(async (scope) => adminRoutes(scope, ctx));
  await app.register(async (scope) => webhookRoutes(scope, ctx));

  // security.txt (only when a contact is configured)
  app.get("/.well-known/security.txt", async (_req, reply) => {
    if (!ctx.config.securityContactEmail) return reply.code(404).send("Not found");
    const expires = new Date(ctx.clock.now().getTime() + 180 * 86_400_000).toISOString();
    return reply
      .type("text/plain; charset=utf-8")
      .send(`Contact: mailto:${ctx.config.securityContactEmail}\nExpires: ${expires}\nCanonical: ${ctx.config.appUrl.origin}/.well-known/security.txt\n`);
  });

  registerClient(app, opts.staticRoot);
  return app;
}

function registerClient(app: FastifyInstance, root: string | undefined): void {
  const apiNotFound = (_req: unknown, reply: import("fastify").FastifyReply) =>
    reply
      .code(404)
      .type("application/json; charset=utf-8")
      .send({ ok: false, error: { code: "NOT_FOUND", message: "That resource was not found.", requestId: (reply.request as { id: string }).id } } satisfies Fail);

  if (!root || !existsSync(path.join(root, "index.html"))) {
    app.setNotFoundHandler(apiNotFound);
    return;
  }
  const indexHtml = readFileSync(path.join(root, "index.html"));
  const known = new Set(CLIENT_ROUTES);

  void app.register(fastifyStatic, {
    root,
    index: false,
    wildcard: false,
    dotfiles: "ignore",
    preCompressed: true,
    cacheControl: false,
    setHeaders(res, filePath) {
      const rel = path.relative(root, filePath).split(path.sep).join("/");
      res.header("Cache-Control", rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    },
  });

  const sendIndex = (reply: import("fastify").FastifyReply, status: number) =>
    reply.code(status).type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(indexHtml);

  app.get("/*", async (req, reply) => {
    const p = req.url.split("?")[0]!.replace(/\/+$/, "") || "/";
    if (p.startsWith("/api/")) return apiNotFound(req, reply);
    if (p.startsWith("/assets/") || /\.[a-z0-9]{1,8}$/i.test(p)) {
      // Real file? The static plugin handles it; reaching here means it doesn't exist.
      if (existsSync(path.join(root, p)) && !p.includes("..")) return reply.sendFile(p.slice(1));
      return reply.code(404).type("text/plain; charset=utf-8").header("Cache-Control", "no-store").send("Not found");
    }
    // Real HTTP 404 for unknown pages, while still rendering the VOXY 404 experience.
    return sendIndex(reply, known.has(p) ? 200 : 404);
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return apiNotFound(req, reply);
    if (req.method === "GET" || req.method === "HEAD") return sendIndex(reply, 404);
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  });
}
