import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseUnavailableError } from "../../server/db";
import { Client, createHarness, signedIn, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness({}, { handlerTimeoutMs: 300 });
});
afterAll(async () => {
  await h.close();
});

describe("failure handling", () => {
  it("database unavailable → safe 503, request id, diagnostics only in the server log; recovers afterwards", async () => {
    const real = h.ctx.db.query.bind(h.ctx.db);
    (h.ctx.db as any).query = async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432 postgres://voxy:hunter2@db/voxy"), { code: "ECONNREFUSED" });
    };
    const r = await new Client(h).get("/api/ready");
    (h.ctx.db as any).query = real;
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(r.body.error.requestId).toBeTruthy();
    expect(r.headers["retry-after"]).toBeTruthy();
    expect(r.raw).not.toMatch(/ECONNREFUSED|postgres:|hunter2|10\.0\.0\.5/);
    const logged = h.logs.join("");
    expect(logged).toContain(r.body.error.requestId);
    expect(logged).toContain("database unavailable");
    expect((await new Client(h).get("/api/ready")).status).toBe(200);
  });

  it("wraps DatabaseUnavailableError from the pool layer the same way", async () => {
    const real = h.ctx.db.query.bind(h.ctx.db);
    (h.ctx.db as any).query = async () => {
      throw new DatabaseUnavailableError(new Error("pool exhausted"));
    };
    const r = await new Client(h).post("/api/auth/login", { email: "a@voxy.test", password: "whatever-password-1" });
    (h.ctx.db as any).query = real;
    expect(r.status).toBe(503);
  });

  it("unexpected exceptions → generic 500 with correlation id; stack/SQL/paths never reach the client", async () => {
    const real = h.ctx.db.query.bind(h.ctx.db);
    (h.ctx.db as any).query = async () => {
      throw new Error('syntax error at or near "FROM" in /home/deploy/voxy/server/db/pg.ts:42 SELECT secret FROM users');
    };
    const r = await new Client(h).get("/api/ready");
    (h.ctx.db as any).query = real;
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("INTERNAL");
    expect(r.raw).not.toMatch(/syntax error|SELECT|\/home\/|pg\.ts|stack|at Object/);
    expect(r.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.logs.join("")).toContain("/home/deploy/voxy/server/db/pg.ts"); // full diagnostics server-side
  });

  it("slow handlers time out with a safe 503 instead of hanging", async () => {
    const real = h.ctx.db.query.bind(h.ctx.db);
    (h.ctx.db as any).query = () => new Promise((resolve) => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 1500));
    const t0 = Date.now();
    const r = await new Client(h).get("/api/ready");
    (h.ctx.db as any).query = real;
    expect(Date.now() - t0).toBeLessThan(1400);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("REQUEST_TIMEOUT");
  });

  it("a failing mail transport never fails or reveals anything about the request, and is logged", async () => {
    const { email } = await signedIn(h);
    const real = h.mailer.send.bind(h.mailer);
    h.mailer.send = async () => {
      throw new Error("SMTP 550 mailbox unavailable smtp-secret-pass");
    };
    const r = await new Client(h).post("/api/auth/forgot-password", { email });
    await h.ctx.idle();
    h.mailer.send = real;
    expect(r.status).toBe(202);
    expect(h.logs.join("")).toContain("background task failed");
  });

  it("unknown API routes and methods return the normalised error shape", async () => {
    const c = new Client(h);
    const r = await c.get("/api/does/not/exist");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const m = await c.request("PUT", "/api/auth/session", {});
    expect([404, 405]).toContain(m.status);
  });
});
