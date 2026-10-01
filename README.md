# VOXY

The VOXY marketing site (React + Vite + Tailwind v4 + three.js) with a real production system underneath it: server-side sessions, email verification, password reset, account security, Stripe billing, legal pages, hardened HTTP layer, PostgreSQL, tests and CI.

> Status: engineered for production use, **not yet launched or independently audited**. See [`docs/SECURITY.md`](docs/SECURITY.md) "Known gaps" and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) "Pre-launch checklist" before going live.

## Quick start (no external services needed)

```bash
npm ci
cp .env.example .env     # optional; defaults work for local development
npm run dev              # API on :8080 (embedded PGlite in ./.data) + Vite on :5173
```

Open http://localhost:5173. In development, verification and reset emails are printed in the API log.

Production-like run: `npm run build && npm start` (single process serves the SPA and the API on `PORT`).

## Scripts

| Script                                        | What it does                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                                 | API (tsx watch) + Vite dev server with `/api` proxy                               |
| `npm run build`                               | Client (`dist/client`, brotli/gzip precompressed) + server bundle (`dist-server`) |
| `npm start`                                   | Run the built server                                                              |
| `npm test`                                    | Server (PGlite) + client (jsdom) test suites                                      |
| `npm run typecheck` / `lint` / `format:check` | TypeScript (client + server), ESLint (+security rules), Prettier                  |
| `npm run verify:build`                        | Fails if the browser bundle contains secrets, source maps or inline scripts       |
| `npm run audit:deps`                          | `npm audit` on production dependencies (high+)                                    |
| `node scripts/scan-secrets.mjs`               | Repo secret scan                                                                  |
| `BASE_URL=… node scripts/smoke.mjs`           | Smoke test against a running server                                               |

## Layout

```
src/        React app (sections/components unchanged; app/, pages/, lib/, ui/, three/ added)
server/     Fastify API: config, http/, auth/, authz/, billing/, db/ (+migrations), mail/, routes/
shared/     Constants shared by client and server (known SPA routes)
tests/      server/ (auth, authz, billing, security, reliability, regressions) and client/
docs/       MIGRATION_PLAN.md, SECURITY.md, DEPLOYMENT.md
scripts/    build-server, verify-build, scan-secrets, smoke
```

## Configuration

All configuration is server-only environment variables, documented in [`.env.example`](.env.example). Nothing from the environment is bundled into the browser. Staging and production fail closed on missing or unsafe configuration.

## Honest limits

No claim is made that this system is "secure", "unhackable" or "compliant" with any regulation. It implements the controls listed in `docs/SECURITY.md`, which also lists what was tested and what was not. Legal pages are drafts until the business/legal owner reviews them and sets `LEGAL_REVIEWED=true`.
