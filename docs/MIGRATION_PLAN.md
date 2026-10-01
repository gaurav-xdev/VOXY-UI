# VOXY — migration plan

> **Provenance note.** The inspection below was done first and drove every decision. This file was written down
> after most of the implementation, not before it as the brief asked. The "Decisions" section records what the
> inspection implied; it is accurate, but it is not a pre-approval artefact.

## 1. What the repository was (inspection findings)

| Area           | Finding                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack          | React 19 + Vite 7 + Tailwind v4 + three.js / react-three-fiber / drei, framer-motion, GSAP, Lenis. Single page, no router, no error boundaries.                                                                                                                                      |
| Backend        | **None.** No server, no database, no auth, no billing, no API calls, no env vars, no tests, no CI, no deployment config. (The brief assumes an existing backend to replace; there was nothing to replace, so the backend is greenfield.)                                             |
| Build          | `vite-plugin-singlefile` inlined everything into one 1.5 MB `index.html` (433 kB gzip) and used Google Fonts (render-blocking third-party request; incompatible with a strict CSP).                                                                                                  |
| 3D             | Three always-on WebGL canvases (page background + the orb twice). No quality tiers, no pause when off-screen or hidden, opaque black clear colour on the orb canvases (visible black rectangle), pointer-driven rotation that did not work for the hero orb (`pointer-events-none`). |
| Fake behaviour | CTA form set `sent=true` locally and sent nothing; footer links were `#`; hard-coded "VOXY Systems" company name.                                                                                                                                                                    |
| Claims         | Marketing copy asserts on-device encryption, zero-latency voice, "private by design", and "Volumetric Rim + Bloom". None can be verified from the repo. **Left unchanged under the UI freeze; the owner must confirm or reword them.**                                               |
| Tooling        | Layout did not match its own tsconfig/vite config (sources at repo root vs `src/`).                                                                                                                                                                                                  |

## 2. Decisions

- **UI freeze.** Existing sections, components, CSS tokens, copy, 3D scenes and animations are kept. Changes are limited to: self-hosted fonts (same families), a Sign-in/Account link in the nav, real footer links and company name from config, the CTA form wired to a real endpoint with loading/error states, focus-visible outlines, reduced-motion handling, and the removal of the opaque orb background. New pages reuse `GlassCard`, the pill inputs/buttons and the tracking-label typography.
- **Keep the Vite SPA** (no framework migration), add `react-router`, `@tanstack/react-query`, code-splitting per route, lazy 3D.
- **Server:** Fastify 5 + zod 4, PostgreSQL (`pg`), PGlite (real Postgres compiled to WASM) for tests and zero-install development only, esbuild bundle, one process serves API + static SPA (same origin ⇒ no CORS, `SameSite=Strict` cookies).
- **Auth:** server-side sessions (random opaque token, only its hash stored), Argon2id (`@node-rs/argon2`), email verification, enumeration-safe flows. No JWT, no localStorage, no custom crypto.
- **Authorization:** one central policy (`server/authz/policy.ts`). Roles: `user`, `admin` (+ anonymous). A "support" role was deliberately not created, because nothing in the product needs it.
- **Billing:** Stripe (official SDK, current API). Server resolves price IDs from config; the browser only sends a plan key. Webhook → signature verification → idempotent event ledger → ordering guard → entitlements recomputed from stored state.
- **Legal:** all company facts from environment; unset values render as visibly marked placeholders; every legal page carries a "Draft — pending review" banner until `LEGAL_REVIEWED=true`.
- **Environments:** `development | test | staging | production`; staging and production fail closed on missing/unsafe config.

## 3. Order of work actually followed

Inspect → this plan's decisions → preserve UI (move sources into `src/`, baseline screenshots) → server boundary → auth → database → billing → security headers/CSRF/rate limits → error recovery → performance → 3D hardening → tests (server, then client) → CI/CD → production-style verification (real headless-browser flows against the built server).

## 4. Phases and acceptance

| Phase            | Deliverable                                                                | Verified by                                                                        |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Server boundary  | Fastify app, config, request IDs, structured logs, safe errors             | `tests/server/{smoke,security,reliability}.test.ts`                                |
| Auth             | Register/verify/login/logout/reset/reauth/sessions                         | `tests/server/auth.test.ts`, `regressions.test.ts`                                 |
| Authorization    | Central policy, ownership checks, admin routes                             | `tests/server/authz.test.ts`                                                       |
| Database         | Forward-only migrations, constraints, indexes, transactions, pooling       | migrations run in every test file; real-Postgres boot is a CI job (see Known gaps) |
| Billing          | Checkout, portal, cancel/resume, webhooks, entitlements                    | `tests/server/billing.test.ts`                                                     |
| Frontend         | Router, auth/account/billing UI, legal pages, 404, error boundaries        | `tests/client/*`, browser flows (§ Verification in README)                         |
| Performance + 3D | Code-splitting, deferred 3D, tiers, visibility-aware rendering             | build size report, in-browser transfer measurements                                |
| CI/CD            | Format, types, lint, tests, build, audit, secret scan, artifact validation | `.github/workflows/ci.yml` (not yet executed on GitHub when this was written)      |

## 5. Rollback

The change is additive at the data layer (new database, nothing existing to migrate). Application rollback = redeploy the previous image; migrations are forward-only, so a schema change that must be reverted needs a new forward migration. Take a backup before every deploy that contains a migration (see `DEPLOYMENT.md`).
