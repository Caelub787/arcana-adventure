-- Spectator share-link token expiration (Task #43)
-- Adds optional expires_at to spectator_tokens. NULL = never expires.

ALTER TABLE "spectator_tokens"
    ADD COLUMN IF NOT EXISTS "expires_at" timestamp;
