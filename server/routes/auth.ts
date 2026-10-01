import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import * as svc from "../auth/service";
import { emailSchema, GENERIC_ACCEPTED } from "../auth/service";
import { ok } from "../http/respond";
import { parse } from "../http/validate";
import { clearSessionCookie, cookieNames, csrfTokenFor, loadAuth, requireAuth, setDeviceCookie, setSessionCookie } from "../http/guards";
import { resolveSession } from "../auth/sessions";

const email = emailSchema.pipe(z.string());
const token = z.string().min(20, "Invalid token.").max(100, "Invalid token.");
const password = z.string().min(1, "Enter your password.").max(1024, "Too long.");

const publicUser = (u: { email: string; emailVerified: boolean; role: string }) => ({ email: u.email, emailVerified: u.emailVerified, role: u.role });

export async function authRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const names = cookieNames(ctx);

  // Session restoration. Always 200 so anonymous visitors don't generate error noise.
  app.get("/api/auth/session", { preHandler: loadAuth(ctx) }, async (req) => {
    if (!req.auth) return ok({ user: null, csrfToken: null });
    return ok({ user: publicUser(req.auth.user), csrfToken: csrfTokenFor(ctx, req.auth.session.id) });
  });

  app.post("/api/auth/register", async (req, reply) => {
    const body = parse(z.strictObject({ email: email.pipe(z.email("Enter a valid email address.")), password: z.string().max(1024, "Too long.") }), req.body);
    await svc.register(ctx, req.meta, body);
    reply.code(202);
    return ok(GENERIC_ACCEPTED);
  });

  app.post("/api/auth/verify-email", async (req) => {
    const { token: t } = parse(z.strictObject({ token }), req.body);
    await svc.verifyEmailToken(ctx, req.meta, t);
    return ok({ verified: true });
  });

  app.post("/api/auth/resend-verification", async (req, reply) => {
    const body = parse(z.strictObject({ email }), req.body);
    await svc.resendVerification(ctx, req.meta, body.email);
    reply.code(202);
    return ok(GENERIC_ACCEPTED);
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = parse(z.strictObject({ email: email.pipe(z.email("Enter a valid email address.")), password }), req.body);
    const r = await svc.login(ctx, req.meta, body, { sessionToken: req.cookies[names.session], deviceCookie: req.cookies[names.device] });
    setSessionCookie(ctx, reply, r.token, r.expiresAt);
    setDeviceCookie(ctx, reply, r.deviceCookie);
    const resolved = await resolveSession(ctx, r.token);
    return ok({ user: publicUser(r.user), csrfToken: resolved ? csrfTokenFor(ctx, resolved.session.id) : null });
  });

  // Logout is idempotent and needs no CSRF token (worst case: forced logout), but is still same-origin/JSON only.
  app.post("/api/auth/logout", { preHandler: loadAuth(ctx) }, async (req, reply) => {
    await svc.logout(ctx, req.meta, req.auth, req.sessionToken);
    clearSessionCookie(ctx, reply);
    return ok({ loggedOut: true });
  });

  app.post("/api/auth/forgot-password", async (req, reply) => {
    const body = parse(z.strictObject({ email }), req.body);
    await svc.forgotPassword(ctx, req.meta, body.email);
    reply.code(202);
    return ok(GENERIC_ACCEPTED);
  });

  app.post("/api/auth/reset-password", async (req, reply) => {
    const body = parse(z.strictObject({ token, password: z.string().max(1024, "Too long.") }), req.body);
    await svc.resetPassword(ctx, req.meta, body);
    clearSessionCookie(ctx, reply); // every session for the account was revoked
    return ok({ reset: true });
  });

  app.post("/api/auth/reauth", { preHandler: requireAuth(ctx) }, async (req, reply) => {
    const body = parse(z.strictObject({ password }), req.body);
    const r = await svc.reauthenticate(ctx, req.meta, req.auth!, body.password);
    setSessionCookie(ctx, reply, r.token, r.expiresAt);
    return ok({ reauthenticated: true });
  });
}
