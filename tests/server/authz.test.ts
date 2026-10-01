import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { can } from "../../server/authz/policy";
import { Client, GOOD_PASSWORD, createHarness, freshEmail, signedIn, userId, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function adminClient() {
  const a = await signedIn(h);
  await h.ctx.db.query("UPDATE users SET role='admin' WHERE email=$1", [a.email]);
  return a;
}

const PROTECTED: Array<[string, string]> = [
  ["GET", "/api/account/sessions"],
  ["GET", "/api/account/security-events"],
  ["GET", "/api/entitlements"],
  ["POST", "/api/account/password"],
  ["POST", "/api/account/logout-everywhere"],
  ["DELETE", "/api/account"],
  ["DELETE", "/api/account/sessions/3f8f9a4e-1b2c-4d5e-8f90-123456789abc"],
  ["POST", "/api/auth/reauth"],
  ["GET", "/api/billing"],
  ["POST", "/api/billing/checkout"],
  ["POST", "/api/billing/portal"],
  ["POST", "/api/billing/cancel"],
  ["POST", "/api/billing/resume"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/audit"],
  ["POST", "/api/admin/users/3f8f9a4e-1b2c-4d5e-8f90-123456789abc/status"],
];

describe("anonymous access", () => {
  it.each(PROTECTED)("%s %s requires authentication", async (method, url) => {
    const r = await new Client(h).request(method, url, method === "GET" ? undefined : {});
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("vertical privilege escalation", () => {
  it("regular users are denied every admin route and the denial is recorded", async () => {
    const u = await signedIn(h);
    const id = await userId(h, u.email);
    for (const [m, url] of [
      ["GET", "/api/admin/users"],
      ["GET", "/api/admin/audit"],
    ] as const) {
      const r = await u.client.request(m, url);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("FORBIDDEN");
    }
    const r = await u.client.post(`/api/admin/users/${id}/status`, { status: "disabled" });
    expect(r.status).toBe(403);
    const ev = await h.ctx.db.query("SELECT 1 FROM security_events WHERE user_id=$1 AND type='authz_denied'", [id]);
    expect(ev.rowCount).toBeGreaterThanOrEqual(2);
  });

  it("role/permission fields from the browser are ignored or rejected everywhere", async () => {
    const u = await signedIn(h);
    const hdr = { "x-role": "admin", "x-user-role": "admin", "x-is-admin": "true", "x-user-id": "1", "x-forwarded-user": "admin" };
    expect((await u.client.request("GET", "/api/admin/users", undefined, hdr)).status).toBe(403);
    const session = await u.client.get("/api/auth/session");
    expect(session.body.data.user.role).toBe("user");
    // Cookies carrying role claims are ignored; only the opaque session cookie matters.
    u.client.jar.set("role", "admin");
    u.client.jar.set("isAdmin", "true");
    expect((await u.client.get("/api/admin/users")).status).toBe(403);
    for (const [url, body] of [
      ["/api/account/password", { currentPassword: u.password, newPassword: "x".repeat(20), role: "admin" }],
      ["/api/auth/login", { email: u.email, password: u.password, role: "admin" }],
      ["/api/billing/checkout", { plan: "pro", isAdmin: true }],
    ] as const) {
      expect((await u.client.post(url, body)).status).toBe(422);
    }
    const row = await h.ctx.db.query<{ role: string }>("SELECT role FROM users WHERE email=$1", [u.email]);
    expect(row.rows[0]!.role).toBe("user");
  });

  it("the database refuses unknown roles / statuses (defence in depth)", async () => {
    const u = await signedIn(h);
    await expect(h.ctx.db.query("UPDATE users SET role='superuser' WHERE email=$1", [u.email])).rejects.toThrow();
    await expect(h.ctx.db.query("UPDATE users SET status='vip' WHERE email=$1", [u.email])).rejects.toThrow();
  });

  it("promotion to admin only takes effect server-side (existing session picks up the DB role)", async () => {
    const u = await signedIn(h);
    expect((await u.client.get("/api/admin/users")).status).toBe(403);
    await h.ctx.db.query("UPDATE users SET role='admin' WHERE email=$1", [u.email]);
    expect((await u.client.get("/api/admin/users")).status).toBe(200);
    await h.ctx.db.query("UPDATE users SET role='user' WHERE email=$1", [u.email]);
    expect((await u.client.get("/api/admin/users")).status).toBe(403); // demotion is immediate
  });

  it("an unverified admin account is not trusted", async () => {
    const a = await signedIn(h, { verify: false });
    await h.ctx.db.query("UPDATE users SET role='admin' WHERE email=$1", [a.email]);
    expect((await a.client.get("/api/admin/users")).status).toBe(403);
  });
});

describe("admin operations", () => {
  it("lists users without leaking credential material", async () => {
    const a = await adminClient();
    const r = await a.client.get("/api/admin/users?limit=5");
    expect(r.status).toBe(200);
    expect(r.body.data.users.length).toBeGreaterThan(0);
    expect(r.raw).not.toMatch(/argon2|password|token_hash/i);
    expect((await a.client.get("/api/admin/users?limit=9999")).status).toBe(422);
    expect((await a.client.get("/api/admin/users?before=nonsense")).status).toBe(422);
    expect((await a.client.get("/api/admin/users?' OR 1=1--=1")).status).toBe(422);
  });

  it("disabling a user needs fresh auth, revokes their sessions and is audited; admins cannot disable themselves", async () => {
    const a = await adminClient();
    const victim = await signedIn(h);
    const vid = await userId(h, victim.email);
    const self = await userId(h, a.email);
    expect((await a.client.post(`/api/admin/users/${self}/status`, { status: "disabled" })).status).toBe(403);
    h.clock.advance(11 * 60_000);
    expect((await a.client.post(`/api/admin/users/${vid}/status`, { status: "disabled" })).body.error.code).toBe("REAUTH_REQUIRED");
    await a.client.post("/api/auth/reauth", { password: a.password });
    expect((await a.client.post(`/api/admin/users/${vid}/status`, { status: "disabled" })).status).toBe(200);
    expect((await victim.client.get("/api/auth/session")).body.data.user).toBeNull();
    expect((await new Client(h).post("/api/auth/login", { email: victim.email, password: victim.password })).status).toBe(401);
    expect((await h.ctx.db.query("SELECT 1 FROM audit_events WHERE action='admin.user_disabled' AND target_id=$1", [vid])).rowCount).toBe(1);
    expect((await a.client.post(`/api/admin/users/${vid}/status`, { status: "active" })).status).toBe(200);
    expect((await new Client(h).post("/api/auth/login", { email: victim.email, password: victim.password })).status).toBe(200);
    expect((await a.client.post(`/api/admin/users/3f8f9a4e-1b2c-4d5e-8f90-123456789abc/status`, { status: "disabled" })).status).toBe(404);
    expect((await a.client.post(`/api/admin/users/${vid}/status`, { status: "disabled", role: "admin" })).status).toBe(422);
  });

  it("serves the audit trail to admins only", async () => {
    const a = await adminClient();
    const r = await a.client.get("/api/admin/audit?limit=10");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.events)).toBe(true);
  });
});

describe("horizontal access (user-to-user)", () => {
  it("one user cannot read or change another user's sessions, events, billing or entitlements", async () => {
    const a = await signedIn(h);
    const b = await signedIn(h);
    const aSessions = (await a.client.get("/api/account/sessions")).body.data.sessions;
    const bSessions = (await b.client.get("/api/account/sessions")).body.data.sessions;
    expect(aSessions.map((s: any) => s.id)).not.toEqual(expect.arrayContaining(bSessions.map((s: any) => s.id)));
    expect((await a.client.del(`/api/account/sessions/${bSessions[0].id}`)).status).toBe(404);
    // query-string / body user id manipulation changes nothing
    const ev = await a.client.get(`/api/account/security-events?userId=${await userId(h, b.email)}`);
    expect(ev.status).toBe(200);
    const bid = await userId(h, b.email);
    const mine = await h.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM security_events WHERE user_id=$1", [bid]);
    expect(ev.body.data.events.length).toBeLessThanOrEqual(30);
    expect(mine.rows[0]!.n).toBeGreaterThan(0);
    const aOnly = await h.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM security_events WHERE user_id=$1", [await userId(h, a.email)]);
    expect(ev.body.data.events.length).toBe(Math.min(30, aOnly.rows[0]!.n));
  });

  it("session tokens cannot be used to act as another user", async () => {
    const a = await signedIn(h);
    const b = await signedIn(h);
    const cross = new Client(h);
    cross.jar.set("__Host-voxy_session", a.client.jar.get("__Host-voxy_session")!);
    cross.csrf = b.client.csrf; // B's CSRF token with A's session
    const r = await cross.post("/api/account/password", { currentPassword: a.password, newPassword: "totally new passphrase 9" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("CSRF_INVALID");
  });
});

describe("policy unit tests", () => {
  const user = { id: "u1", email: "a@b.c", emailVerified: true, role: "user" as const, status: "active" as const, passwordChangedAt: new Date() };
  it("owner-only actions", () => {
    expect(can(user, "session:revoke", { ownerId: "u1" })).toBe(true);
    expect(can(user, "session:revoke", { ownerId: "u2" })).toBe(false);
    expect(can(user, "billing:manage", {})).toBe(false);
  });
  it("admin actions", () => {
    expect(can(user, "admin:users:read")).toBe(false);
    expect(can({ ...user, role: "admin" }, "admin:users:read")).toBe(true);
    expect(can({ ...user, role: "admin", emailVerified: false }, "admin:users:read")).toBe(false);
    expect(can({ ...user, role: "admin" }, "admin:users:update", { targetUserId: "u1" })).toBe(false);
    expect(can({ ...user, role: "admin" }, "admin:users:update", { targetUserId: "u9" })).toBe(true);
    expect(can({ ...user, role: "admin", status: "disabled" }, "admin:users:read")).toBe(false);
    expect(can(null, "billing:checkout")).toBe(false);
    expect(can({ ...user, emailVerified: false }, "billing:checkout")).toBe(false);
  });
});

void GOOD_PASSWORD;
void freshEmail;
