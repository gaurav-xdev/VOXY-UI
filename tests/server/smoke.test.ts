import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createHarness, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe("smoke", () => {
  it("serves health and normalised JSON 404", async () => {
    const c = new Client(h);
    const r = await c.get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, data: { status: "ok" } });
    const nf = await c.get("/api/nope");
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe("NOT_FOUND");
    expect(nf.body.error.requestId).toMatch(/[0-9a-f-]{36}/);
  });
});
