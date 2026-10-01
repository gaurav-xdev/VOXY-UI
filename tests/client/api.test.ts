// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, describeError, get, post, setCsrfToken } from "@/lib/api";
import { fail, mockApi, ok } from "./helpers";

beforeEach(() => {
  setCsrfToken(null);
  vi.useRealTimers();
});
afterEach(() => vi.unstubAllGlobals());

describe("API client: response normalisation", () => {
  it("unwraps the {ok,data} envelope", async () => {
    mockApi({ "GET /api/x": () => ok({ a: 1 }) });
    expect(await get("/api/x")).toEqual({ a: 1 });
  });

  it("turns error envelopes into ApiError with code, fields and request id", async () => {
    mockApi({ "POST /api/x": () => fail(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fields: { email: "Enter a valid email address." } }) });
    const err = (await post("/api/x", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "VALIDATION_FAILED", requestId: "req-test-123", fields: { email: "Enter a valid email address." } });
  });

  it("never surfaces raw non-JSON bodies (proxy error pages, stack traces, SQL)", async () => {
    mockApi({ "POST /api/x": () => ({ status: 502, body: "<html>upstream error: select * from users at /srv/app/db.ts:44</html>" }) });
    const err = (await post("/api/x", {}).catch((e: unknown) => e)) as ApiError;
    const { message } = describeError(err);
    expect(message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(err.message)).not.toMatch(/select|srv|upstream/i);
  });

  it("describeError hides messages of unknown thrown errors", () => {
    expect(describeError(new Error("ECONNREFUSED 10.0.0.5:5432 password=hunter2")).message).toBe("Something went wrong. Please try again.");
  });

  it("shows the support reference only for server-side (5xx) failures", () => {
    expect(describeError(new ApiError(500, "INTERNAL", "Something went wrong.", "abc-123")).reference).toBe("abc-123");
    expect(describeError(new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password.", "abc-123")).reference).toBeUndefined();
  });

  it("explains rate limits with the retry delay", () => {
    expect(describeError(new ApiError(429, "RATE_LIMITED", "Too many attempts.", "r", undefined, 45)).message).toContain("45 seconds");
    expect(describeError(new ApiError(429, "RATE_LIMITED", "Too many attempts.", "r", undefined, 600)).message).toContain("10 minutes");
  });

  it("maps a network failure to a friendly NETWORK error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = (await post("/api/x", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ code: "NETWORK", status: 0 });
    expect(err.isNetwork).toBe(true);
  });
});

describe("API client: request behaviour", () => {
  it("sends the CSRF token (memory only) on unsafe methods and never on GET", async () => {
    const { calls } = mockApi({ "POST /api/x": () => ok({}), "GET /api/y": () => ok({}) });
    setCsrfToken("tok-123");
    await post("/api/x", { a: 1 });
    await get("/api/y");
    expect(calls[0]!.headers["X-CSRF-Token"]).toBe("tok-123");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(calls[1]!.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("retries safe reads on 503 but never replays mutations", async () => {
    vi.useFakeTimers();
    let n = 0;
    const { calls } = mockApi({
      "GET /api/flaky": () => (++n < 3 ? fail(503, "UNAVAILABLE", "Service unavailable.") : ok({ fine: true })),
      "POST /api/flaky": () => fail(503, "UNAVAILABLE", "Service unavailable."),
    });
    const p = get("/api/flaky");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ fine: true });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(3);

    await expect(post("/api/flaky", {})).rejects.toBeInstanceOf(ApiError);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("refreshes a stale CSRF token once and retries", async () => {
    let attempt = 0;
    const { calls } = mockApi({
      "POST /api/x": () => (++attempt === 1 ? fail(403, "CSRF_INVALID", "Security check failed.") : ok({ done: true })),
      "GET /api/auth/session": () => ok({ user: null, csrfToken: "fresh" }),
    });
    setCsrfToken("stale");
    expect(await api("POST", "/api/x", { body: {} })).toEqual({ done: true });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.headers["X-CSRF-Token"])).toEqual(["stale", "fresh"]);
  });

  it("does not loop forever on persistent CSRF failure", async () => {
    mockApi({ "POST /api/x": () => fail(403, "CSRF_INVALID", "Security check failed."), "GET /api/auth/session": () => ok({ user: null, csrfToken: "t" }) });
    await expect(post("/api/x", {})).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });
});
