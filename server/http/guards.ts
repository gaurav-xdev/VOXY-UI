import type { FastifyReply, FastifyRequest } from "fastify";

export type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
import type { AppContext, RequestMeta } from "../context";
import type { AuthContext } from "../auth/sessions";
import { resolveSession } from "../auth/sessions";
import { can, type Action, type Resource } from "../authz/policy";
import { securityEvent } from "../events";
import { hmac, safeEqual } from "../security/crypto";
import { Errors } from "./errors";

declare module "fastify" {
  interface FastifyRequest {
    meta: RequestMeta;
    auth: AuthContext | null;
    sessionToken: string | undefined;
  }
}

export const cookieNames = (ctx: AppContext) =>
  ctx.config.secureCookies ? { session: "__Host-voxy_session", device: "__Host-voxy_device" } : { session: "voxy_session", device: "voxy_device" };

export const csrfTokenFor = (ctx: AppContext, sessionId: string) => hmac(ctx.config.appSecret, `csrf:${sessionId}`);

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(cookieNames(ctx).session, token, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export function setDeviceCookie(ctx: AppContext, reply: FastifyReply, value: string): void {
  reply.setCookie(cookieNames(ctx).device, value, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: 180 * 86_400,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  reply.clearCookie(cookieNames(ctx).session, { path: "/", httpOnly: true, secure: ctx.config.secureCookies, sameSite: "strict" });
}

/** Populate req.auth from the session cookie (null when anonymous). Does not reject. */
export function loadAuth(ctx: AppContext): Guard {
  return async (req) => {
    const token = req.cookies[cookieNames(ctx).session];
    req.sessionToken = token;
    req.auth = await resolveSession(ctx, token);
  };
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function deny(ctx: AppContext, req: FastifyRequest, type: "authz_denied" | "csrf_rejected", extra: Record<string, unknown>): Promise<void> {
  try {
    await securityEvent(ctx, ctx.db, { userId: req.auth?.user.id ?? null, type, meta: req.meta, metadata: { route: req.routeOptions.url, method: req.method, ...extra } });
  } catch (err) {
    ctx.log.error({ err, requestId: req.meta.requestId }, "failed to record security event");
  }
}

/** Authenticated + valid session + (for state-changing requests) valid CSRF token. */
export function requireAuth(ctx: AppContext): Guard {
  const load = loadAuth(ctx);
  return async (req, reply) => {
    await load(req, reply);
    if (!req.auth) throw Errors.unauthenticated();
    if (UNSAFE.has(req.method)) {
      const sent = req.headers["x-csrf-token"];
      const expected = csrfTokenFor(ctx, req.auth.session.id);
      if (typeof sent !== "string" || !safeEqual(sent, expected)) {
        await deny(ctx, req, "csrf_rejected", { reason: "token" });
        throw Errors.csrf();
      }
    }
  };
}

/** Sensitive operations need a recent password confirmation (re-authentication). */
export function requireFreshAuth(ctx: AppContext): Guard {
  return async (req) => {
    const a = req.auth;
    if (!a) throw Errors.unauthenticated();
    if (ctx.clock.now().getTime() - a.session.reauthenticatedAt.getTime() > ctx.config.session.reauthWindowMs) throw Errors.reauth();
  };
}

/** Throws 403 (and records the denial) unless the policy allows `action` on `resource`. */
export async function authorize(ctx: AppContext, req: FastifyRequest, action: Action, resource: Resource = {}): Promise<void> {
  if (!can(req.auth?.user ?? null, action, resource)) {
    await deny(ctx, req, "authz_denied", { action });
    throw Errors.forbidden();
  }
}

export const requireAction =
  (ctx: AppContext, action: Action): Guard =>
  async (req) =>
    authorize(ctx, req, action);

/** Email must be verified (checked from the DB-backed session, never from the client). */
export const requireVerified = (): Guard => async (req) => {
  if (!req.auth) throw Errors.unauthenticated();
  if (!req.auth.user.emailVerified) throw Errors.emailNotVerified();
};
