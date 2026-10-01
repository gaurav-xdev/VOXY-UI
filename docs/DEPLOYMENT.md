# VOXY — deployment and operations

## Environments

| `DEPLOY_ENV` | Database                      | Hardened (fails closed)? | Mail             | Notes                                                 |
| ------------ | ----------------------------- | ------------------------ | ---------------- | ----------------------------------------------------- |
| development  | PGlite in `./.data` (default) | no                       | printed to log   | `npm run dev` (Vite on 5173 proxies `/api` to 8080)   |
| test         | in-memory PGlite              | no                       | in-memory outbox | `npm test`                                            |
| staging      | PostgreSQL                    | **yes**                  | SMTP             | Use Stripe **test** keys; separate DB and secrets     |
| production   | PostgreSQL                    | **yes**                  | SMTP             | Stripe live keys; never share secrets/DB with staging |

Hardened environments refuse to start unless: `APP_URL` is https, `APP_SECRET` ≥ 32 chars, `DATABASE_URL` is a real Postgres URL (TLS on unless explicitly disabled), `SMTP_URL` is set, `LEGAL_COMPANY_NAME` and `LEGAL_CONTACT_EMAIL` are set, and billing configuration is complete or fully absent.

## Public vs server-only configuration

**Everything in `.env.example` is server-only.** The browser bundle contains no environment values and no `VITE_*` variables are used. The only runtime data the SPA receives is `GET /api/config/public` (company/legal fields and a billing on/off flag). CI (`verify:build`) fails if secret-like strings or server variable names appear in `dist/client`.

## Build and run

```bash
npm ci
npm run build          # dist/client (SPA, precompressed .br/.gz) + dist-server (API bundle + SQL migrations)
node --env-file=.env dist-server/index.js
```

Or build the container: `docker build -t voxy .` (multi-stage, non-root, health check on `/api/health`).

Put TLS termination in front (the app sets HSTS and Secure cookies). Set `TRUST_PROXY_HOPS` to the number of proxies you control; leaving it at 0 behind a load balancer makes every user share one IP for rate limiting.

## Database

- Forward-only SQL migrations in `server/db/migrations`, checksummed, applied in a transaction under an advisory lock. Editing an applied migration fails startup.
- Production recommendation: `AUTO_MIGRATE=false`, run `node dist-server/index.js` with `AUTO_MIGRATE=true` once as a release step (or from a one-off job), then roll out. With `AUTO_MIGRATE=false` the server refuses to start on a stale schema.
- Pooling: `DATABASE_POOL_MAX` (default 10 per instance); keep `instances × pool` under the database's connection limit.
- Indexes and constraints (FKs with cascade rules, CHECKs on role/status, unique lower-cased email) are in `0001_init.sql`.

### Backup strategy (to be implemented by the operator)

1. Use a managed PostgreSQL with automated daily snapshots **and** point-in-time recovery; encrypt at rest.
2. Add a nightly logical backup (`pg_dump --format=custom`) copied to separate storage in another region/account, with retention set by the business.
3. **Test restores** at least quarterly into a scratch database and record the time taken; set RPO/RTO targets from that evidence. None are promised here.
4. Take a snapshot before any deploy that contains a migration.
5. Backups contain personal data and password hashes: restrict access and apply the same retention/deletion policy as production.

## Stripe

1. Create products/prices; set `BILLING_PLANS_JSON=[{"key":"pro","label":"…","priceId":"price_…"}]`.
2. Create a webhook endpoint `POST {APP_URL}/api/webhooks/stripe` subscribed to `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`, `invoice.paid` (see `server/billing/stripe.ts` for the handled set) and set `STRIPE_WEBHOOK_SECRET`.
3. Configure the Stripe Customer Portal (cancellation, payment-method updates).
4. Test the full flow with test keys in staging before using live keys. Webhook failures return 5xx so Stripe retries; malformed payloads are acknowledged and logged.

## Health, logs, operations

- `/api/health` (liveness, no dependencies) and `/api/ready` (database reachable).
- JSON logs to stdout with request IDs; ship them to your log platform. Alert on: 5xx rate, `security:login_rate_limited` spikes, `webhook_signature_invalid`, readiness failures.
- Rotating `APP_SECRET` invalidates CSRF tokens and "trusted device" markers (users re-authenticate normally); sessions remain valid.
- Graceful shutdown on SIGTERM (drains requests, flushes background jobs, closes the pool).

## Pre-launch checklist

- [ ] Legal owner has reviewed `/terms`, `/privacy`, `/refunds`, `/contact`; fill every `LEGAL_*` value; set `LEGAL_REVIEWED=true`.
- [ ] Landing-page claims verified or reworded by the owner.
- [ ] CI is green on the PR (including `postgres-smoke`); Docker image builds.
- [ ] Staging exercised end to end with real SMTP and Stripe test mode; one real restore drill done.
- [ ] `TRUST_PROXY_HOPS` correct; HSTS preload decision made (the header is sent without `preload`).
- [ ] Monitoring/alerting and an on-call path exist; `SECURITY_CONTACT_EMAIL` set.
