import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import type { AppContext } from "../context";
import { Errors } from "./errors";

/**
 * CSP built around what VOXY actually loads (verified in a real browser, see docs/SECURITY.md):
 *  - one same-origin module script + hashed CSS (no inline script, no eval)
 *  - self-hosted variable fonts (no Google Fonts)
 *  - WebGL canvases (no network), a data: SVG used for the film-grain overlay
 *  - Stripe is reached ONLY by top-level redirect to hosted Checkout/Portal, so no Stripe.js and no extra connect-src
 */
export function contentSecurityPolicy(hardened: boolean): Record<string, Iterable<string>> {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'", "blob:"],
    manifestSrc: ["'self'"],
    mediaSrc: ["'none'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    ...(hardened ? { upgradeInsecureRequests: [] } : {}),
  };
}

export async function registerSecurity(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: contentSecurityPolicy(ctx.config.hardened) },
    strictTransportSecurity: ctx.config.secureCookies ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xFrameOptions: { action: "deny" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: false,
    xDnsPrefetchControl: { allow: false },
    originAgentCluster: true,
  });
  app.addHook("onRequest", async (_req, reply) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), interest-cohort=()");
  });

  const origin = ctx.config.appUrl.origin;
  const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  // CSRF layer 1 (all state-changing /api requests): same-origin only + JSON-only bodies.
  // Layer 2 (authenticated routes): per-session synchroniser token, see guards.ts.
  app.addHook("onRequest", async (req) => {
    if (!UNSAFE.has(req.method) || !req.url.startsWith("/api/") || req.url.startsWith("/api/webhooks/")) return;
    const o = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    const crossSite = (typeof o === "string" && o !== origin) || site === "cross-site" || site === "same-site";
    if (crossSite) {
      ctx.log.warn(
        { event: "security", type: "csrf_rejected", requestId: req.id, origin: typeof o === "string" ? o.slice(0, 100) : undefined, site, url: req.url.split("?")[0] },
        "security:csrf_rejected",
      );
      throw Errors.csrf();
    }
    const ct = req.headers["content-type"];
    if (typeof ct !== "string" || !/^application\/json(\s*;|$)/i.test(ct)) throw Errors.unsupportedMedia();
  });
}
