-- VOXY initial schema. Forward-only: never edit after release; add a new migration.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  password_hash      text NOT NULL,
  email_verified_at  timestamptz,
  role               text NOT NULL DEFAULT 'user',
  status             text NOT NULL DEFAULT 'active',
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalised CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin')),
  CONSTRAINT users_status_valid CHECK (status IN ('active', 'disabled'))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 of the random session token. The token itself is never stored.
  token_hash         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  reauthenticated_at timestamptz NOT NULL DEFAULT now(),
  ip_address         text,
  user_agent         text,
  revoked_at         timestamptz,
  revoked_reason     text,
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE email_verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_verification_tokens_hash_key ON email_verification_tokens (token_hash);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens (user_id);

CREATE TABLE password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX password_reset_tokens_hash_key ON password_reset_tokens (token_hash);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- Account security events: visible to the account owner ("recent security activity").
CREATE TABLE security_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  type        text NOT NULL,
  ip_address  text,
  user_agent  text,
  request_id  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_events_user_idx ON security_events (user_id, created_at DESC);
CREATE INDEX security_events_type_idx ON security_events (type, created_at DESC);

-- Operator audit trail: privileged, billing and account-lifecycle actions.
CREATE TABLE audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  request_id    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id, created_at DESC);

CREATE TABLE billing_customers (
  user_id              uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'stripe',
  provider_customer_id text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_customers_provider_customer_key ON billing_customers (provider, provider_customer_id);

CREATE TABLE subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider                 text NOT NULL DEFAULT 'stripe',
  provider_subscription_id text NOT NULL,
  plan_key                 text NOT NULL,
  provider_price_id        text,
  status                   text NOT NULL,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  current_period_end       timestamptz,
  past_due_since           timestamptz,
  canceled_at              timestamptz,
  -- Ordering guard: webhook events older than this are ignored (out-of-order delivery).
  provider_synced_at       timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_valid CHECK (status IN
    ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'))
);
CREATE UNIQUE INDEX subscriptions_provider_key ON subscriptions (provider, provider_subscription_id);
CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);

-- Entitlements are DERIVED server-side from subscription state. Never written from the client.
CREATE TABLE entitlements (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key        text NOT NULL,
  source     text NOT NULL,
  source_ref text,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  CONSTRAINT entitlements_source_valid CHECK (source IN ('subscription', 'manual'))
);

-- Webhook idempotency / duplicate-event protection.
CREATE TABLE webhook_events (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  outcome      text NOT NULL DEFAULT 'processed',
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

CREATE TABLE waitlist_signups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_email_normalised CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX waitlist_email_key ON waitlist_signups (email);
