-- External library sync (CanvasRealms etc.) — OAuth2 + bearer sync API + signed webhooks.

CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" text NOT NULL UNIQUE,
  "client_secret_hash" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "redirect_uris" text[] NOT NULL,
  "allowed_scopes" text[] NOT NULL DEFAULT ARRAY['library:read','library:write','webhooks:manage']::text[],
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "code" text PRIMARY KEY,
  "client_id" text NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "scopes" text[] NOT NULL,
  "code_challenge" text,
  "code_challenge_method" text,
  "expires_at" timestamp NOT NULL,
  "consumed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "token" text PRIMARY KEY,
  "client_id" text NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scopes" text[] NOT NULL,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_user_idx" ON "oauth_access_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_client_idx" ON "oauth_access_tokens"("client_id");

CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
  "token" text PRIMARY KEY,
  "client_id" text NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scopes" text[] NOT NULL,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "external_entity_links" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "integration" text NOT NULL,
  "external_id" text NOT NULL,
  "entity_kind" text NOT NULL,
  "internal_id" varchar NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ext_link_uniq"
  ON "external_entity_links"("integration","entity_kind","external_id","user_id");

CREATE TABLE IF NOT EXISTS "outgoing_webhooks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" text NOT NULL,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "outgoing_webhooks_client_idx" ON "outgoing_webhooks"("client_id");

CREATE TABLE IF NOT EXISTS "outbound_webhook_jobs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "webhook_id" varchar NOT NULL REFERENCES "outgoing_webhooks"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "outbound_jobs_status_next_idx"
  ON "outbound_webhook_jobs"("status","next_attempt_at");
