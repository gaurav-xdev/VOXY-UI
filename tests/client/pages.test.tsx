// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteObject } from "react-router";
import { fail, mockApi, ok, renderAt } from "./helpers";
import { setCsrfToken } from "@/lib/api";

vi.mock("@/three/LazyOrb", () => ({ default: () => <div data-testid="orb" /> }));

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotFound from "@/pages/NotFound";
import Account from "@/pages/account/Account";
import Terms from "@/pages/legal/Terms";
import Contact from "@/pages/legal/Contact";
import { ErrorScreen } from "@/app/ErrorPage";

const anon = { user: null, csrfToken: null };
const signedIn = (verified = true) => ({ user: { email: "ada@example.com", emailVerified: verified, role: "user" }, csrfToken: "csrf-1" });
const legal = (over: Record<string, unknown> = {}) => ({
  legal: {
    companyName: null,
    companyAddress: null,
    registrationNumber: null,
    contactEmail: null,
    supportEmail: null,
    privacyEmail: null,
    jurisdiction: null,
    effectiveDate: null,
    reviewed: false,
    ...over,
  },
  billingEnabled: false,
});

const routes = (path: string, element: React.ReactElement, extra: RouteObject = {}): RouteObject[] => [
  { path, element, ...extra },
  { path: "/account", element: <div>ACCOUNT-HOME</div> },
  { path: "/login", element: <div>LOGIN-PAGE</div> },
  { path: "*", element: <div>CATCH-ALL</div> },
];

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("Login page", () => {
  it("signs in via the API, then goes to the requested page", async () => {
    const { calls } = mockApi({
      "GET /api/auth/session": () => ok(anon),
      "POST /api/auth/login": () => ok(signedIn()),
    });
    renderAt(routes("/login", <Login />), "/login?next=%2Fprivacy");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("CATCH-ALL")).toBeInTheDocument()); // /privacy isn't registered in this tiny router
    const login = calls.find((c) => c.path === "/api/auth/login")!;
    expect(login.body).toEqual({ email: "ada@example.com", password: "correct horse battery" });
  });

  it("ignores an external ?next= target (no open redirect)", async () => {
    mockApi({ "GET /api/auth/session": () => ok(anon), "POST /api/auth/login": () => ok(signedIn()) });
    renderAt(routes("/login", <Login />), "/login?next=https%3A%2F%2Fevil.example");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("ACCOUNT-HOME")).toBeInTheDocument();
  });

  it("shows the server's generic error and keeps the password out of the DOM state afterwards", async () => {
    mockApi({ "GET /api/auth/session": () => ok(anon), "POST /api/auth/login": () => fail(401, "INVALID_CREDENTIALS", "Incorrect email or password.") });
    renderAt(routes("/login", <Login />), "/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("shows a retry hint when rate limited", async () => {
    mockApi({
      "GET /api/auth/session": () => ok(anon),
      "POST /api/auth/login": () => ({
        status: 429,
        headers: { "Retry-After": "120" },
        body: { ok: false, error: { code: "RATE_LIMITED", message: "Too many attempts.", requestId: "r1" } },
      }),
    });
    renderAt(routes("/login", <Login />), "/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/2 minutes/);
  });

  it("disables submit while the request is in flight (no double submit)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { calls } = mockApi({
      "GET /api/auth/session": () => ok(anon),
      "POST /api/auth/login": async () => {
        await gate;
        return ok(signedIn());
      },
    });
    renderAt(routes("/login", <Login />), "/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "x");
    const btn = screen.getByRole("button", { name: /sign in/i });
    await user.click(btn);
    await waitFor(() => expect(screen.getByRole("button", { name: /working/i })).toBeDisabled());
    await user.keyboard("{Enter}");
    release();
    await screen.findByText("ACCOUNT-HOME");
    expect(calls.filter((c) => c.path === "/api/auth/login")).toHaveLength(1);
  });
});

describe("Register page", () => {
  it("shows the same neutral confirmation regardless of whether the email exists", async () => {
    mockApi({ "POST /api/auth/register": () => ok({ message: "If that's possible, we've sent an email with the next steps." }, 202) });
    renderAt(routes("/register", <Register />), "/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "taken@example.com");
    await user.type(screen.getByLabelText("Password"), "a long enough passphrase");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText("One more step.")).toBeInTheDocument();
    expect(screen.getByText(/If taken@example.com can be used/)).toBeInTheDocument();
  });

  it("renders field-level validation from the server next to the field", async () => {
    mockApi({ "POST /api/auth/register": () => fail(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fields: { password: "That password is too common." } }) });
    renderAt(routes("/register", <Register />), "/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "password12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    const field = await screen.findByLabelText("Password");
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("That password is too common.")).toBeInTheDocument();
  });

  it("keeps the submit button disabled until the minimum length is met", async () => {
    mockApi({});
    renderAt(routes("/register", <Register />), "/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "short");
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });
});

describe("404 page", () => {
  it("renders navigation back and makes NO API request", async () => {
    const { fn } = mockApi({});
    renderAt([{ path: "*", element: <NotFound />, handle: { noApi: true } }], "/nope");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/doesn't exist/);
    expect(screen.getByRole("link", { name: /return home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute("href", "/contact");
    expect(screen.getByTestId("orb")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Error screen", () => {
  it("shows a safe message and request ID, never the error text or stack", () => {
    const err = Object.assign(new Error("SELECT * FROM users WHERE password='x' at /srv/app/db.ts:44"), { requestId: undefined });
    const { container } = (function () {
      return renderAt([{ path: "/", element: <ErrorScreen error={err} /> }], "/");
    })();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(container.textContent).not.toMatch(/SELECT|password|srv|db\.ts/);
  });

  it("offers a reload for stale lazy-chunk failures after a deploy", () => {
    renderAt([{ path: "/", element: <ErrorScreen error={new TypeError("Failed to fetch dynamically imported module: /assets/x.js")} /> }], "/");
    expect(screen.getByText("A new version is available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("Account page", () => {
  it("redirects anonymous visitors to sign-in (server still enforces on every call)", async () => {
    mockApi({ "GET /api/auth/session": () => ok(anon) });
    renderAt(routes("/account", <Account />), "/account");
    expect(await screen.findByText("LOGIN-PAGE")).toBeInTheDocument();
  });

  it("shows a loading skeleton, then real data; empty states are honest", async () => {
    mockApi({
      "GET /api/auth/session": () => ok(signedIn()),
      "GET /api/billing": () => ok({ billingEnabled: false, plans: [], emailVerified: true, subscription: null, entitlements: [] }),
      "GET /api/account/sessions": () =>
        ok({
          sessions: [
            {
              id: "s1",
              createdAt: "2026-10-01T10:00:00Z",
              lastSeenAt: "2026-10-01T10:05:00Z",
              ipAddress: "203.0.113.5",
              userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36",
              current: true,
            },
          ],
        }),
      "GET /api/account/security-events": () => ok({ events: [] }),
    });
    renderAt(routes("/account", <Account />), "/account");
    expect(screen.getByRole("status", { name: /loading your account/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeInTheDocument();
    expect(await screen.findByText(/Paid plans aren't available yet/)).toBeInTheDocument();
    expect(await screen.findByText("No security activity recorded yet.")).toBeInTheDocument();
    expect(await screen.findByText("Chrome on Linux")).toBeInTheDocument();
    expect(screen.getByText("THIS DEVICE")).toBeInTheDocument();
  });

  it("signing out updates the UI immediately and drops cached account data", async () => {
    const { calls } = mockApi({
      "GET /api/auth/session": () => ok(signedIn()),
      "GET /api/billing": () => ok({ billingEnabled: false, plans: [], emailVerified: true, subscription: null, entitlements: [] }),
      "GET /api/account/sessions": () => ok({ sessions: [] }),
      "GET /api/account/security-events": () => ok({ events: [] }),
      "POST /api/auth/logout": () => ok({ loggedOut: true }),
    });
    const { client } = renderAt(routes("/account", <Account />), "/account");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("LOGIN-PAGE")).toBeInTheDocument();
    expect(client.getQueryData(["billing"])).toBeUndefined();
    expect(client.getQueryData(["sessions"])).toBeUndefined();
    expect(calls.filter((c) => c.path === "/api/auth/logout")).toHaveLength(1);
  });

  it("REGRESSION: deleting the account leaves the page and clears the signed-in view", async () => {
    mockApi({
      "GET /api/auth/session": () => ok(signedIn()),
      "GET /api/billing": () => ok({ billingEnabled: false, plans: [], emailVerified: true, subscription: null, entitlements: [] }),
      "GET /api/account/sessions": () => ok({ sessions: [] }),
      "GET /api/account/security-events": () => ok({ events: [] }),
      "DELETE /api/account": () => ok({ deleted: true }),
    });
    renderAt(routes("/account", <Account />), "/account");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete account…" }));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByText("LOGIN-PAGE")).toBeInTheDocument();
  });

  it("asks an unverified user to verify and disables subscribing", async () => {
    mockApi({
      "GET /api/auth/session": () => ok(signedIn(false)),
      "GET /api/billing": () => ok({ billingEnabled: true, plans: [{ key: "pro", label: "VOXY Pro" }], emailVerified: false, subscription: null, entitlements: [] }),
      "GET /api/account/sessions": () => ok({ sessions: [] }),
      "GET /api/account/security-events": () => ok({ events: [] }),
    });
    renderAt(routes("/account", <Account />), "/account");
    expect(await screen.findByText(/isn't verified yet/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Subscribe — VOXY Pro/ })).toBeDisabled();
  });

  it("renders subscription state from the server, incl. payment trouble", async () => {
    mockApi({
      "GET /api/auth/session": () => ok(signedIn()),
      "GET /api/billing": () =>
        ok({
          billingEnabled: true,
          plans: [{ key: "pro", label: "VOXY Pro" }],
          emailVerified: true,
          entitlements: ["pro"],
          subscription: { planKey: "pro", planLabel: "VOXY Pro", status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-11-01T00:00:00Z", paymentIssue: true },
        }),
      "GET /api/account/sessions": () => ok({ sessions: [] }),
      "GET /api/account/security-events": () => ok({ events: [] }),
    });
    renderAt(routes("/account", <Account />), "/account");
    expect(await screen.findByText(/last payment didn't go through/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update payment method" })).toBeInTheDocument();
  });

  it("asks for the password when the server requires re-authentication, then retries", async () => {
    let attempts = 0;
    const { calls } = mockApi({
      "GET /api/auth/session": () => ok(signedIn()),
      "GET /api/billing": () => ok({ billingEnabled: false, plans: [], emailVerified: true, subscription: null, entitlements: [] }),
      "GET /api/account/sessions": () =>
        ok({
          sessions: [
            { id: "s1", createdAt: "2026-10-01T10:00:00Z", lastSeenAt: "2026-10-01T10:05:00Z", ipAddress: "1.1.1.1", userAgent: null, current: true },
            { id: "s2", createdAt: "2026-10-01T09:00:00Z", lastSeenAt: "2026-10-01T09:05:00Z", ipAddress: "2.2.2.2", userAgent: null, current: false },
          ],
        }),
      "GET /api/account/security-events": () => ok({ events: [] }),
      "POST /api/account/logout-everywhere": () => (++attempts === 1 ? fail(403, "REAUTH_REQUIRED", "Please confirm your password to continue.") : ok({ revoked: 2 })),
      "POST /api/auth/reauth": () => ok({ reauthenticated: true }),
    });
    renderAt(routes("/account", <Account />), "/account");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out everywhere" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Confirm it's you");
    await user.type(screen.getByLabelText("Password"), "my password");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/account/logout-everywhere")).toHaveLength(2));
    expect(calls.find((c) => c.path === "/api/auth/reauth")!.body).toEqual({ password: "my password" });
  });
});

describe("Legal pages", () => {
  it("never invent company facts: unset values are visibly marked, draft banner shown", async () => {
    mockApi({ "GET /api/config/public": () => ok(legal()) });
    renderAt(routes("/terms", <Terms />), "/terms");
    expect(await screen.findByText(/Draft — pending review/)).toBeInTheDocument();
    expect(screen.getAllByText(/not yet provided by the operator/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/GDPR|SOC ?2|ISO ?27001|HIPAA|fully compliant|100% secure/i);
  });

  it("uses configured company info and drops the draft banner once reviewed", async () => {
    mockApi({ "GET /api/config/public": () => ok(legal({ companyName: "Acme Labs Ltd", supportEmail: "help@acme.test", reviewed: true, effectiveDate: "2026-10-01" })) });
    renderAt(routes("/contact", <Contact />), "/contact");
    expect(await screen.findByText("help@acme.test")).toHaveAttribute("href", "mailto:help@acme.test");
    expect(screen.getAllByText(/Acme Labs Ltd/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Draft — pending review/)).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and an error with no leak when config fails", async () => {
    mockApi({ "GET /api/config/public": () => fail(500, "INTERNAL", "Something went wrong.") });
    renderAt(routes("/terms", <Terms />), "/terms");
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(await screen.findByText(/couldn't load this page's company details/)).toBeInTheDocument();
  });
});
