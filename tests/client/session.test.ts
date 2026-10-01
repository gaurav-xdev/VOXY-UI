// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { safeNext } from "@/lib/session";
import { readFragmentToken } from "@/lib/token";

describe("safeNext (post-login redirect)", () => {
  it.each([
    ["/account", "/account"],
    ["/account?checkout=success", "/account?checkout=success"],
    ["/privacy#top", "/privacy#top"],
  ])("allows known same-site path %s", (input, out) => expect(safeNext(input)).toBe(out));

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "/not-a-real-route",
    "/api/auth/logout",
    "",
    null,
    undefined,
    "account",
  ])("rejects %s", (input) => expect(safeNext(input as string | null)).toBe("/account"));
});

describe("one-time token handling", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));
  const TOKEN = "A".repeat(43);

  it("reads the token from the fragment and scrubs it from the address bar", () => {
    window.history.replaceState(null, "", `/reset-password#token=${TOKEN}`);
    expect(readFragmentToken()).toBe(TOKEN);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
  });

  it("survives a StrictMode double read on the same page", () => {
    window.history.replaceState(null, "", `/verify-email#token=${TOKEN}`);
    expect(readFragmentToken()).toBe(TOKEN);
    expect(readFragmentToken()).toBe(TOKEN);
  });

  it("does not hand a token to a different page", () => {
    window.history.replaceState(null, "", `/verify-email#token=${TOKEN}`);
    readFragmentToken();
    window.history.replaceState(null, "", "/reset-password");
    expect(readFragmentToken()).toBeNull();
  });

  it("ignores malformed tokens", () => {
    window.history.replaceState(null, "", "/reset-password-x#token=short");
    expect(readFragmentToken()).toBeNull();
  });
});
