import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, GOOD_PASSWORD, createHarness, freshEmail, signedIn, tokenFrom, userId, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const sessionCookieName = "__Host-voxy_session";

describe("registration", () => {
  it("creates an unverified account, hashes the password with argon2id, and emails a verification link", async () => {
    const c = new Client(h);
    const email = freshEmail();
    const r = await c.post("/api/auth/register", { email, password: GOOD_PASSWORD });
    expect(r.status).toBe(202);
    await h.ctx.idle();
    const row = (await h.ctx.db.query<{ password_hash: string; email_verified_at: Date | null }>("SELECT password_hash, email_verified_at FROM users WHERE email=$1", [email]))
      .rows[0]!;
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(GOOD_PASSWORD);
    expect(row.email_verified_at).toBeNull();
    const mail = h.mailer.last(email)!;
    expect(mail.text).toContain(`${h.config.appUrl.origin}/verify-email#token=`);
  });

  it("is anti-enumeration: identical response for existing and new emails, and notifies the real owner", async () => {
    const { email } = await signedIn(h);
    const before = h.mailer.outbox.length;
    const c = new Client(h);
    const again = await c.post("/api/auth/register", { email, password: "another-long-password-99" });
    const fresh = await new Client(h).post("/api/auth/register", { email: freshEmail(), password: GOOD_PASSWORD });
    expect(again.status).toBe(fresh.status);
    expect(again.body).toEqual(fresh.body);
    await h.ctx.idle();
    expect(h.mailer.outbox.length).toBeGreaterThan(before);
    expect(h.mailer.last(email)!.subject).toMatch(/sign-up attempt/i);
  });

  it("treats email case/whitespace variants as the same account", async () => {
    const { email } = await signedIn(h);
    const c = new Client(h);
    await c.post("/api/auth/register", { email: `  ${email.toUpperCase()} `, password: GOOD_PASSWORD });
    const n = await h.ctx.db.query("SELECT 1 FROM users WHERE email = $1", [email]);
    expect(n.rowCount).toBe(1);
  });

  it.each([
    ["short", "too short"],
    ["password1234", "common"],
    ["aaaaaaaaaaaaaaaa", "repetitive"],
  ])("rejects weak password %s", async (pw) => {
    const r = await new Client(h).post("/api/auth/register", { email: freshEmail(), password: pw });
    expect(r.status).toBe(422);
    expect(r.body.error.fields.password).toBeTruthy();
  });

  it("rejects mass-assignment of privileged fields", async () => {
    const r = await new Client(h).post("/api/auth/register", { email: freshEmail(), password: GOOD_PASSWORD, role: "admin", isAdmin: true, emailVerified: true });
    expect(r.status).toBe(422);
    expect(r.body.error.fields.role ?? r.body.error.fields._).toBeTruthy();
  });

  it("rate limits registration per IP", async () => {
    const c = new Client(h);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.post("/api/auth/register", { email: freshEmail(), password: GOOD_PASSWORD })).status;
    expect(last).toBe(429);
  });
});

describe("email verification", () => {
  it("verifies once; the token is single-use", async () => {
    const c = new Client(h);
    const email = freshEmail();
    await c.post("/api/auth/register", { email, password: GOOD_PASSWORD });
    await h.ctx.idle();
    const token = tokenFrom(h.mailer.last(email)!.text);
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(200);
    const replay = await c.post("/api/auth/verify-email", { token });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects expired, unknown and malformed tokens identically", async () => {
    const c = new Client(h);
    const email = freshEmail();
    await c.post("/api/auth/register", { email, password: GOOD_PASSWORD });
    await h.ctx.idle();
    const token = tokenFrom(h.mailer.last(email)!.text);
    h.clock.advance(25 * 3600_000);
    const expired = await c.post("/api/auth/verify-email", { token });
    const unknown = await c.post("/api/auth/verify-email", { token: "A".repeat(43) });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe(unknown.body.error.code);
    expect((await c.post("/api/auth/verify-email", { token: "short" })).status).toBe(422);
    expect((await c.post("/api/auth/verify-email", { token: { $ne: 1 } })).status).toBe(422);
  });

  it("resend invalidates the previous token and does not reveal account existence", async () => {
    const c = new Client(h);
    const email = freshEmail();
    await c.post("/api/auth/register", { email, password: GOOD_PASSWORD });
    await h.ctx.idle();
    const first = tokenFrom(h.mailer.last(email)!.text);
    h.clock.advance(61_000);
    const r1 = await c.post("/api/auth/resend-verification", { email });
    const r2 = await c.post("/api/auth/resend-verification", { email: freshEmail("ghost") });
    expect(r1.status).toBe(202);
    expect(r1.body).toEqual(r2.body);
    await h.ctx.idle();
    const second = tokenFrom(h.mailer.last(email)!.text);
    expect(second).not.toBe(first);
    expect((await c.post("/api/auth/verify-email", { token: first })).status).toBe(400);
    expect((await c.post("/api/auth/verify-email", { token: second })).status).toBe(200);
  });

  it("resend has a cooldown and a per-email cap", async () => {
    const email = freshEmail();
    await new Client(h).post("/api/auth/register", { email, password: GOOD_PASSWORD });
    await h.ctx.idle();
    const sent0 = h.mailer.outbox.filter((m) => m.to === email).length;
    const c = new Client(h);
    for (let i = 0; i < 3; i++) await c.post("/api/auth/resend-verification", { email });
    await h.ctx.idle();
    expect(h.mailer.outbox.filter((m) => m.to === email).length).toBe(sent0 + 1); // cooldown swallowed the rest
    const capped = await c.post("/api/auth/resend-verification", { email });
    expect(capped.status).toBe(429);
  });
});

describe("login & sessions", () => {
  it("sets a hardened session cookie and never exposes the password hash or token in the body", async () => {
    const { client, email } = await signedIn(h);
    const r = await client.post("/api/auth/login", { email, password: GOOD_PASSWORD });
    const setCookie = ([] as string[]).concat(r.headers["set-cookie"]).find((c) => c.startsWith(sessionCookieName))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).not.toMatch(/Domain=/i); // __Host- prefix requirement
    expect(r.raw).not.toMatch(/argon2|password_hash/i);
    expect(r.body.data.user).toEqual({ email, emailVerified: true, role: "user" });
  });

  it("stores only a hash of the session token", async () => {
    const { client } = await signedIn(h);
    const token = client.jar.get(sessionCookieName)!;
    const rows = await h.ctx.db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows.rows.some((r) => r.token_hash === token)).toBe(false);
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });

  it("returns the SAME error for unknown email, wrong password and disabled account (no enumeration)", async () => {
    const { email } = await signedIn(h);
    const disabled = await signedIn(h);
    await h.ctx.db.query("UPDATE users SET status='disabled' WHERE email=$1", [disabled.email]);
    const a = await new Client(h).post("/api/auth/login", { email: freshEmail("nobody"), password: GOOD_PASSWORD });
    const b = await new Client(h).post("/api/auth/login", { email, password: "wrong-password-123456" });
    const c = await new Client(h).post("/api/auth/login", { email: disabled.email, password: disabled.password });
    for (const r of [a, b, c]) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(r.body.error.message).toBe("Incorrect email or password.");
    }
  });

  it("rotates the session on login (fixation defence): the old token is revoked", async () => {
    const { client, email, password } = await signedIn(h);
    const oldToken = client.jar.get(sessionCookieName)!;
    await client.post("/api/auth/login", { email, password });
    const newToken = client.jar.get(sessionCookieName)!;
    expect(newToken).not.toBe(oldToken);
    const attacker = new Client(h);
    attacker.jar.set(sessionCookieName, oldToken);
    expect((await attacker.get("/api/auth/session")).body.data.user).toBeNull();
    expect((await client.get("/api/auth/session")).body.data.user.email).toBe(email);
  });

  it("ignores an attacker-planted unknown session cookie (fixation): login always mints a fresh token", async () => {
    const e = freshEmail();
    const setup = new Client(h);
    await setup.post("/api/auth/register", { email: e, password: GOOD_PASSWORD });
    await h.ctx.idle();
    const victim = new Client(h);
    victim.jar.set(sessionCookieName, "planted-by-attacker-0123456789abcdef0123456789");
    const r = await victim.post("/api/auth/login", { email: e, password: GOOD_PASSWORD });
    expect(r.status).toBe(200);
    expect(victim.jar.get(sessionCookieName)).not.toBe("planted-by-attacker-0123456789abcdef0123456789");
  });

  it("logout invalidates the session server-side (replaying the cookie fails)", async () => {
    const { client } = await signedIn(h);
    const stolen = client.jar.get(sessionCookieName)!;
    const out = await client.post("/api/auth/logout");
    expect(out.status).toBe(200);
    const replay = new Client(h);
    replay.jar.set(sessionCookieName, stolen);
    expect((await replay.get("/api/auth/session")).body.data.user).toBeNull();
    expect((await replay.get("/api/account/sessions")).status).toBe(401);
  });

  it("enforces the absolute session lifetime", async () => {
    const { client } = await signedIn(h);
    h.clock.advance(31 * 86_400_000);
    expect((await client.get("/api/auth/session")).body.data.user).toBeNull();
  });

  it("enforces the idle timeout but keeps active sessions alive", async () => {
    const { client } = await signedIn(h);
    for (let i = 0; i < 3; i++) {
      h.clock.advance(3 * 86_400_000);
      expect((await client.get("/api/auth/session")).body.data.user).not.toBeNull();
    }
    h.clock.advance(8 * 86_400_000); // > 7 day idle
    expect((await client.get("/api/auth/session")).body.data.user).toBeNull();
  });

  it("rejects absurd / malformed session cookies without touching the DB result", async () => {
    for (const v of ["", "x", "A".repeat(500), "' OR 1=1 --", "../../etc/passwd"]) {
      const c = new Client(h);
      c.jar.set(sessionCookieName, v);
      const r = await c.get("/api/auth/session");
      expect(r.status).toBe(200);
      expect(r.body.data.user).toBeNull();
    }
  });

  it("logs a disabled account out immediately", async () => {
    const { client, email } = await signedIn(h);
    await h.ctx.db.query("UPDATE users SET status='disabled' WHERE email=$1", [email]);
    expect((await client.get("/api/auth/session")).body.data.user).toBeNull();
  });
});

describe("brute force & credential stuffing", () => {
  it("throttles repeated failures for one account from one IP, without confirming the account exists", async () => {
    const { email } = await signedIn(h);
    const attacker = new Client(h);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attacker.post("/api/auth/login", { email, password: `wrong-guess-${i}-xxxxxx` })).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    // Even the CORRECT password is refused from that IP while throttled.
    expect((await attacker.post("/api/auth/login", { email, password: GOOD_PASSWORD })).status).toBe(429);
    // Same behaviour for an email that doesn't exist (indistinguishable).
    const ghost = freshEmail("ghost");
    const g: number[] = [];
    for (let i = 0; i < 7; i++) g.push((await attacker.post("/api/auth/login", { email: ghost, password: `wrong-guess-${i}-xxxxxx` })).status);
    expect(g).toEqual(statuses);
  });

  it("does not let an attacker lock the owner out from the owner's own IP", async () => {
    const { email, password } = await signedIn(h);
    const attacker = new Client(h);
    for (let i = 0; i < 6; i++) await attacker.post("/api/auth/login", { email, password: `wrong-guess-${i}-xxxxxx` });
    const owner = new Client(h);
    expect((await owner.post("/api/auth/login", { email, password })).status).toBe(200);
  });

  it("distributed credential stuffing: account-wide throttle blocks unknown devices but NOT the owner's known device", async () => {
    const { client: owner, email, password } = await signedIn(h);
    const device = owner.jar.get("__Host-voxy_device")!;
    expect(device).toBeTruthy();
    for (let i = 0; i < 21; i++) await new Client(h).post("/api/auth/login", { email, password: `stuffing-${i}-xxxxxxxx` });
    const newAttackerIp = await new Client(h).post("/api/auth/login", { email, password });
    expect(newAttackerIp.status).toBe(429); // even with the right password: no device proof
    const returning = new Client(h);
    returning.jar.set("__Host-voxy_device", device);
    expect((await returning.post("/api/auth/login", { email, password })).status).toBe(200);
  });

  it("a device cookie cannot be forged or replayed for another account", async () => {
    const a = await signedIn(h);
    const b = await signedIn(h);
    for (let i = 0; i < 21; i++) await new Client(h).post("/api/auth/login", { email: b.email, password: `stuffing-${i}-xxxxxxxx` });
    const forged = new Client(h);
    forged.jar.set("__Host-voxy_device", a.client.jar.get("__Host-voxy_device")!); // A's cookie on B
    expect((await forged.post("/api/auth/login", { email: b.email, password: b.password })).status).toBe(429);
    const junk = new Client(h);
    junk.jar.set("__Host-voxy_device", `${await userId(h, b.email)}.abc.def`);
    expect((await junk.post("/api/auth/login", { email: b.email, password: b.password })).status).toBe(429);
  });

  it("records suspicious-login events", async () => {
    const { email, password } = await signedIn(h);
    const other = new Client(h);
    for (let i = 0; i < 3; i++) await other.post("/api/auth/login", { email, password: `nope-nope-nope-${i}` });
    await other.post("/api/auth/login", { email, password });
    const types = (await h.ctx.db.query<{ type: string }>("SELECT type FROM security_events WHERE user_id=$1", [await userId(h, email)])).rows.map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(["login_failed", "login_succeeded", "login_new_ip", "login_after_failures"]));
  });
});

describe("password recovery", () => {
  it("full flow: token is single-use, expires, revokes all sessions and notifies the owner", async () => {
    const { client, email, password } = await signedIn(h);
    const other = new Client(h);
    await other.post("/api/auth/login", { email, password });
    const anon = new Client(h);
    const f = await anon.post("/api/auth/forgot-password", { email });
    expect(f.status).toBe(202);
    await h.ctx.idle();
    const mail = h.mailer.last(email)!;
    expect(mail.subject).toMatch(/reset/i);
    const token = tokenFrom(mail.text);
    const newPw = "a brand new passphrase 77";
    const ok = await anon.post("/api/auth/reset-password", { token, password: newPw });
    expect(ok.status).toBe(200);
    await h.ctx.idle();
    expect(h.mailer.last(email)!.subject).toMatch(/changed/i);
    // replay
    expect((await anon.post("/api/auth/reset-password", { token, password: "yet another passphrase 88" })).status).toBe(400);
    // all pre-existing sessions are dead
    expect((await client.get("/api/auth/session")).body.data.user).toBeNull();
    expect((await other.get("/api/auth/session")).body.data.user).toBeNull();
    // old password no longer works, new one does
    expect((await new Client(h).post("/api/auth/login", { email, password })).status).toBe(401);
    expect((await new Client(h).post("/api/auth/login", { email, password: newPw })).status).toBe(200);
  });

  it("is anti-enumeration and rate limited", async () => {
    const { email } = await signedIn(h);
    const c = new Client(h);
    const known = await c.post("/api/auth/forgot-password", { email });
    const unknown = await c.post("/api/auth/forgot-password", { email: freshEmail("ghost") });
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    await h.ctx.idle();
    expect(h.mailer.outbox.some((m) => m.to.startsWith("ghost"))).toBe(false);
    for (let i = 0; i < 3; i++) await c.post("/api/auth/forgot-password", { email });
    expect((await c.post("/api/auth/forgot-password", { email })).status).toBe(429);
  });

  it("expired token fails; newer request invalidates the older token", async () => {
    const { email } = await signedIn(h);
    const c = new Client(h);
    await c.post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    const t1 = tokenFrom(h.mailer.last(email)!.text);
    await c.post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    const t2 = tokenFrom(h.mailer.last(email)!.text);
    expect((await c.post("/api/auth/reset-password", { token: t1, password: "fresh passphrase for t1 11" })).status).toBe(400);
    h.clock.advance(61 * 60_000);
    expect((await c.post("/api/auth/reset-password", { token: t2, password: "fresh passphrase for t2 22" })).status).toBe(400);
  });

  it("a weak new password does not burn the token", async () => {
    const { email } = await signedIn(h);
    const c = new Client(h);
    await c.post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    const t = tokenFrom(h.mailer.last(email)!.text);
    expect((await c.post("/api/auth/reset-password", { token: t, password: "short" })).status).toBe(422);
    expect((await c.post("/api/auth/reset-password", { token: t, password: "strong enough passphrase 33" })).status).toBe(200);
  });

  it("concurrent use of one reset token succeeds exactly once", async () => {
    const { email } = await signedIn(h);
    const c = new Client(h);
    await c.post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    const t = tokenFrom(h.mailer.last(email)!.text);
    const results = await Promise.all([1, 2, 3, 4].map((i) => new Client(h).post("/api/auth/reset-password", { token: t, password: `race condition passphrase ${i}${i}` })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
});

describe("account security", () => {
  it("lists active sessions, revokes only the caller's own, and hides foreign sessions behind 404", async () => {
    const a = await signedIn(h);
    const b = await signedIn(h);
    await a.client.post("/api/auth/login", { email: a.email, password: a.password }); // second session for A
    const list = await a.client.get("/api/account/sessions");
    expect(list.status).toBe(200);
    expect(list.body.data.sessions.some((s: any) => s.current)).toBe(true);
    const bSession = (await b.client.get("/api/account/sessions")).body.data.sessions[0].id;
    const idor = await a.client.del(`/api/account/sessions/${bSession}`);
    expect(idor.status).toBe(404);
    expect((await b.client.get("/api/auth/session")).body.data.user).not.toBeNull(); // untouched
    expect((await a.client.del("/api/account/sessions/not-a-uuid")).status).toBe(422);
  });

  it("password change requires the current password, revokes other sessions, rotates this one", async () => {
    const { client, email, password } = await signedIn(h);
    const second = new Client(h);
    await second.post("/api/auth/login", { email, password });
    const before = client.jar.get(sessionCookieName)!;
    const bad = await client.post("/api/account/password", { currentPassword: "wrong wrong wrong 1", newPassword: "new passphrase number 1" });
    expect(bad.status).toBe(403);
    const ok = await client.post("/api/account/password", { currentPassword: password, newPassword: "new passphrase number 1" });
    expect(ok.status).toBe(200);
    expect(client.jar.get(sessionCookieName)).not.toBe(before);
    expect((await client.get("/api/auth/session")).body.data.user).not.toBeNull();
    expect((await second.get("/api/auth/session")).body.data.user).toBeNull();
    const stale = new Client(h);
    stale.jar.set(sessionCookieName, before);
    expect((await stale.get("/api/auth/session")).body.data.user).toBeNull();
  });

  it("logout-everywhere needs fresh authentication (re-auth), then kills every session", async () => {
    const { client, email, password } = await signedIn(h);
    const second = new Client(h);
    await second.post("/api/auth/login", { email, password });
    h.clock.advance(11 * 60_000); // past the re-auth window
    const denied = await client.post("/api/account/logout-everywhere");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("REAUTH_REQUIRED");
    expect((await client.post("/api/auth/reauth", { password: "not my password 123" })).status).toBe(403);
    expect((await client.post("/api/auth/reauth", { password })).status).toBe(200);
    expect((await client.post("/api/account/logout-everywhere")).status).toBe(200);
    expect((await second.get("/api/auth/session")).body.data.user).toBeNull();
    expect((await client.get("/api/auth/session")).body.data.user).toBeNull();
  });

  it("account deletion needs fresh auth + explicit confirmation and erases the user", async () => {
    const { client, email } = await signedIn(h);
    expect((await client.del("/api/account", { confirm: "nope" })).status).toBe(422);
    expect((await client.del("/api/account", { confirm: "DELETE" })).status).toBe(200);
    expect((await h.ctx.db.query("SELECT 1 FROM users WHERE email=$1", [email])).rowCount).toBe(0);
  });

  it("shows the owner their own security events only", async () => {
    const a = await signedIn(h);
    const r = await a.client.get("/api/account/security-events");
    expect(r.status).toBe(200);
    expect(r.body.data.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body)).not.toMatch(/user_id|password/);
  });
});
