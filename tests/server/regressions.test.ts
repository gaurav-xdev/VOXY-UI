import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, GOOD_PASSWORD, createHarness, signedIn, userId, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/**
 * Regression tests for vulnerabilities found during attacker-minded review.
 * Each documents: reproduce → root cause → fix.
 */
describe("REG-1: client IP cannot be spoofed through X-Forwarded-For (limiter evasion)", () => {
  // Root cause: trust-proxy callback trusted one hop too many (`hop <= n` instead of `hop < n`),
  // so an attacker-prepended X-Forwarded-For entry became req.ip and every per-IP limit could be rotated.
  it("uses the entry appended by OUR proxy, not attacker-controlled leading entries", async () => {
    // inject() connects from 127.0.0.1 (our "proxy"); the proxy appends the real client address last.
    // A failed login records the resolved client IP in security_events.
    const { email } = await signedIn(h);
    await h.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json", origin: h.config.appUrl.origin, "x-forwarded-for": "6.6.6.6, 203.0.113.9" },
      payload: JSON.stringify({ email, password: "definitely-wrong-password-1" }),
    });
    const ev = await h.ctx.db.query<{ ip_address: string }>("SELECT ip_address FROM security_events WHERE user_id=$1 AND type='login_failed' ORDER BY created_at DESC LIMIT 1", [
      await userId(h, email),
    ]);
    expect(ev.rows[0]!.ip_address).toBe("203.0.113.9");
  });

  it("rotating a forged leading X-Forwarded-For value does not reset the login limiter", async () => {
    const { email } = await signedIn(h);
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await h.app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "content-type": "application/json", origin: h.config.appUrl.origin, "x-forwarded-for": `1.1.${i}.${i}, 198.51.100.77` },
        payload: JSON.stringify({ email, password: `wrong-guess-${i}-xxxxxxxx` }),
      });
      codes.push(r.statusCode);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(3);
  });
});

describe("REG-2: parallel guesses cannot outrun the failure counters (check-then-act race)", () => {
  // Root cause: the limiter was consulted with peek() and incremented only AFTER the (slow) password
  // verification, so N concurrent requests all saw count=0. Fix: reserve an attempt atomically up-front.
  it("30 simultaneous wrong guesses from one IP perform at most the allowed number of verifications", async () => {
    const { email } = await signedIn(h);
    const attacker = new Client(h);
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => attacker.post("/api/auth/login", { email, password: `parallel-guess-${i}-xxxxxxx` })));
    const verified = res.filter((r) => r.status === 401).length;
    expect(verified).toBeLessThanOrEqual(5);
    expect(res.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(25);
    const failed = await h.ctx.db.query("SELECT 1 FROM security_events WHERE user_id=$1 AND type='login_failed'", [await userId(h, email)]);
    expect(failed.rowCount).toBeLessThanOrEqual(5);
  });

  it("a legitimate login after a throttled burst from a DIFFERENT IP still works", async () => {
    const { email, password } = await signedIn(h);
    await Promise.all(Array.from({ length: 10 }, (_, i) => new Client(h).post("/api/auth/login", { email, password: `burst-${i}-xxxxxxxxxx` })));
    expect((await new Client(h).post("/api/auth/login", { email, password })).status).toBe(200);
  });

  it("successful logins do not consume the failure budget", async () => {
    const { email, password } = await signedIn(h);
    const c = new Client(h);
    for (let i = 0; i < 12; i++) expect((await c.post("/api/auth/login", { email, password })).status).toBe(200);
  });

  it("re-auth / password-change guesses are race-safe too", async () => {
    const { client } = await signedIn(h);
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => client.post("/api/auth/reauth", { password: `wrong-reauth-${i}-xxxxxx` })));
    expect(res.filter((r) => r.status === 403).length).toBeLessThanOrEqual(5);
    expect(res.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(15);
  });
});

void GOOD_PASSWORD;
