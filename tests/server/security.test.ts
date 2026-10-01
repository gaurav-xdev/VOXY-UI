import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, GOOD_PASSWORD, ORIGIN, createHarness, freshEmail, signedIn, tokenFrom, type Harness } from "./helpers";

let h: Harness;
let root: string;
beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "voxy-static-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>VOXY</title><div id=root></div>");
  writeFileSync(path.join(root, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(path.join(root, "..", "voxy-secret.txt"), "TOP SECRET");
  h = await createHarness({}, { staticRoot: root });
});
afterAll(async () => {
  await h.close();
});

describe("security headers", () => {
  it("HTML responses carry CSP, HSTS, nosniff, frame, referrer, permissions policies", async () => {
    const r = await new Client(h).get("/");
    expect(r.status).toBe(200);
    const csp = String(r.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline/);
    expect(csp).not.toContain("*");
    expect(r.headers["strict-transport-security"]).toMatch(/max-age=31536000/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers["permissions-policy"]).toMatch(/camera=\(\)/);
    expect(r.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("API responses are never cacheable and always carry a request id", async () => {
    const r = await new Client(h).get("/api/auth/session");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
  });

  it("ignores a client-supplied request id (no log injection / trace forgery)", async () => {
    const r = await new Client(h).get("/api/health", { "x-request-id": "evil\nforged-log-line" });
    expect(r.headers["x-request-id"]).not.toContain("evil");
  });

  it("immutable caching only for hashed assets; unknown pages are a real 404; unknown assets are plain 404", async () => {
    const c = new Client(h);
    const asset = await c.get("/assets/app-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await c.get("/login")).status).toBe(200);
    const nf = await c.get("/definitely/not/a/page");
    expect(nf.status).toBe(404);
    expect(nf.raw).toContain("id=root"); // still renders the VOXY 404 page client-side
    expect((await c.get("/assets/missing.js")).status).toBe(404);
  });
});

describe("CORS", () => {
  it("never grants cross-origin access", async () => {
    const c = new Client(h);
    const get = await c.get("/api/health", { origin: "https://evil.example" });
    expect(get.headers["access-control-allow-origin"]).toBeUndefined();
    const pre = await h.app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
    expect(pre.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("CSRF", () => {
  const body = { email: "victim@voxy.test", password: GOOD_PASSWORD };
  it.each([
    ["foreign Origin", { origin: "https://evil.example" }],
    ["null Origin (sandboxed iframe)", { origin: "null" }],
    ["sibling subdomain", { origin: "https://evil.voxy.test" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
  ])("rejects state-changing request with %s", async (_n, hdr) => {
    const r = await new Client(h).request("POST", "/api/auth/login", body, hdr, { origin: null });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("CSRF_INVALID");
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])("rejects non-JSON content-type %s (blocks form-based CSRF)", async (ct) => {
    const r = await h.app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": ct, origin: ORIGIN }, payload: "email=a&password=b" });
    expect(r.statusCode).toBe(415);
  });

  it("rejects a POST with no content-type at all", async () => {
    const r = await h.app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: ORIGIN } });
    expect(r.statusCode).toBe(415);
  });

  it("authenticated mutations need the per-session CSRF token", async () => {
    const u = await signedIn(h);
    const real = u.client.csrf!;
    for (const token of [null, "", "x", real.slice(0, -2) + "zz"]) {
      u.client.csrf = token;
      const r = await u.client.post("/api/account/logout-everywhere");
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("CSRF_INVALID");
    }
    u.client.csrf = real;
    expect((await u.client.post("/api/account/logout-everywhere")).status).toBe(200);
  });

  it("GET endpoints never mutate state", async () => {
    const u = await signedIn(h);
    const before = (await h.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NOT NULL")).rows[0]!.n;
    for (const url of ["/api/account/sessions", "/api/billing", "/api/entitlements", "/api/auth/session"]) await u.client.get(url);
    const after = (await h.ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NOT NULL")).rows[0]!.n;
    expect(after).toBe(before);
  });
});

describe("malformed & hostile input", () => {
  const post = (payload: string, ct = "application/json") =>
    h.app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": ct, origin: ORIGIN, "x-forwarded-for": "10.99.0.1" }, payload });

  it("returns a safe 400 for invalid JSON", async () => {
    const r = await post("{not json");
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error.code).toBe("BAD_REQUEST");
    expect(r.body).not.toMatch(/SyntaxError|Unexpected token|at /);
  });

  it("blocks prototype pollution payloads", async () => {
    for (const p of ['{"__proto__":{"isAdmin":true}}', '{"constructor":{"prototype":{"isAdmin":true}}}']) {
      const r = await post(p);
      expect([400, 422]).toContain(r.statusCode);
    }
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it("rejects oversized bodies (413) and non-object bodies", async () => {
    const big = await post(JSON.stringify({ email: "a@b.co", password: "x".repeat(40_000) }));
    expect(big.statusCode).toBe(413);
    for (const p of ["[]", "null", '"str"', "123"]) expect(await post(p).then((r) => r.statusCode)).toBe(422);
  });

  it("rejects wrong types instead of coercing them (NoSQL-style operators, arrays, objects)", async () => {
    for (const b of [
      { email: { $ne: "" }, password: { $ne: "" } },
      { email: ["a@b.co"], password: "x" },
      { email: "a@b.co", password: 12345 },
      { email: null, password: null },
    ]) {
      const r = await post(JSON.stringify(b));
      expect(r.statusCode).toBe(422);
    }
  });

  it("SQL injection payloads are inert (parameterised queries): no 500, no auth bypass, no table damage", async () => {
    const { email } = await signedIn(h);
    const payloads = ["' OR '1'='1", "admin'--", "'; DROP TABLE users; --", '" OR ""="', "x'; UPDATE users SET role='admin' WHERE '1'='1", "%' OR 1=1 --"];
    for (const p of payloads) {
      for (const [email_, pw] of [
        [`${p}@voxy.test`, p],
        [email, p],
        [p, GOOD_PASSWORD],
      ] as const) {
        const r = await new Client(h).post("/api/auth/login", { email: email_, password: pw });
        expect([401, 422, 429]).toContain(r.status);
      }
      const reg = await new Client(h).post("/api/auth/register", { email: `${p}@voxy.test`, password: GOOD_PASSWORD });
      expect([202, 422, 429]).toContain(reg.status);
    }
    expect((await h.ctx.db.query("SELECT 1 FROM users")).rowCount).toBeGreaterThan(0);
    expect((await h.ctx.db.query("SELECT 1 FROM users WHERE role <> 'user'")).rowCount).toBe(0);
  });

  it("XSS payloads are never reflected or stored as markup", async () => {
    const xss = `"><img src=x onerror=alert(1)>@voxy.test`;
    const w = await new Client(h).post("/api/waitlist", { email: xss });
    expect(w.status).toBe(422);
    expect(w.raw).not.toContain("onerror");
    const r = await new Client(h).get(`/api/auth/session?x=<script>alert(1)</script>`);
    expect(r.raw).not.toContain("<script>");
    expect(String(r.headers["content-type"])).toMatch(/application\/json/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    const lenient = await new Client(h).post("/api/waitlist", { email: "<script>alert(1)</script>@voxy.test" });
    expect(lenient.status).toBe(422);
  });

  it("header-injection / CRLF in email is rejected", async () => {
    const r = await new Client(h).post("/api/auth/forgot-password", { email: "a@voxy.test\r\nBcc: attacker@evil.example" });
    expect(r.status).toBe(422);
  });

  it("path traversal cannot read files outside the static root", async () => {
    const c = new Client(h);
    for (const p of [
      "/..%2fvoxy-secret.txt",
      "/%2e%2e/voxy-secret.txt",
      "/assets/..%2f..%2fvoxy-secret.txt",
      "/assets/../../voxy-secret.txt",
      "/..%5cvoxy-secret.txt",
      "/%00",
      "/assets/%00.js",
      "/.env",
      "/.git/config",
    ]) {
      const r = await h.app.inject({ method: "GET", url: p });
      expect(r.body).not.toContain("TOP SECRET");
      expect([200, 400, 404]).toContain(r.statusCode);
      expect(r.body).not.toContain("[core]");
    }
    void c;
  });

  it("open-redirect surface: the API never redirects based on input", async () => {
    const r = await new Client(h).get("/api/auth/session?next=https://evil.example&redirect=//evil.example");
    expect(r.status).toBe(200);
    expect(r.headers.location).toBeUndefined();
  });
});

describe("SSRF", () => {
  it("no endpoint fetches a user-supplied URL: billing redirect hosts are allow-listed and user URL fields are rejected", async () => {
    const u = await signedIn(h);
    for (const body of [
      { plan: "pro", successUrl: "http://169.254.169.254/latest/meta-data" },
      { plan: "pro", returnUrl: "http://localhost:6379" },
    ]) {
      expect((await u.client.post("/api/billing/checkout", body)).status).toBe(422);
    }
  });
});

describe("secrets & logging hygiene", () => {
  it("never logs passwords, session/CSRF/reset tokens, cookies, or webhook secrets", async () => {
    const password = "unique-log-canary-password-4242";
    const email = freshEmail("canary");
    const c = new Client(h);
    await c.post("/api/auth/register", { email, password });
    await h.ctx.idle();
    const verifyTok = tokenFrom(h.mailer.last(email)!.text);
    await c.post("/api/auth/verify-email", { token: verifyTok });
    await c.post("/api/auth/login", { email, password });
    const session = c.jar.get("__Host-voxy_session")!;
    const csrf = c.csrf!;
    await c.post("/api/auth/login", { email, password: "wrong-wrong-wrong-1" });
    await c.post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    const resetTok = tokenFrom(h.mailer.last(email)!.text);
    await c.post("/api/auth/reset-password", { token: resetTok, password: "new-canary-passphrase-777" });
    await h.app.inject({ method: "POST", url: "/api/webhooks/stripe", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=abc" }, payload: "{}" });
    const logs = h.logs.join("");
    for (const secret of [password, "new-canary-passphrase-777", session, csrf, verifyTok, resetTok, "whsec_testsecret", "sk_test_dummy", "wrong-wrong-wrong-1"]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).not.toMatch(/set-cookie|"cookie"|authorization/i);
    expect(logs).toContain("security:login_succeeded"); // but security events ARE logged
    expect(logs).toContain("security:login_failed");
  });

  it("public config exposes only the allow-listed fields", async () => {
    const r = await new Client(h).get("/api/config/public");
    const text = r.raw;
    expect(text).not.toMatch(/sk_|whsec_|APP_SECRET|DATABASE|SMTP|password/i);
    expect(Object.keys(r.body.data).sort()).toEqual(["billingEnabled", "legal"]);
  });

  it("legal config is rendered only from configuration (no invented company data)", async () => {
    const r = await new Client(h).get("/api/config/public");
    expect(r.body.data.legal.companyName).toBe("Test Co");
    expect(r.body.data.legal.reviewed).toBe(false);
  });
});

describe("global per-IP API budget", () => {
  it("returns 429 with Retry-After once exhausted", async () => {
    const tiny = await createHarness({}, { globalRateLimit: { limit: 5, windowSec: 60 } });
    try {
      const c = new Client(tiny);
      const codes: number[] = [];
      for (let i = 0; i < 8; i++) codes.push((await c.get("/api/health")).status);
      expect(codes.filter((x) => x === 429).length).toBe(3);
      const r = await c.get("/api/health");
      expect(r.headers["retry-after"]).toBeTruthy();
    } finally {
      await tiny.close();
    }
  });
});
