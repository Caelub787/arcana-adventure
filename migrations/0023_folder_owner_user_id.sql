-- CR personal folders: per-player private folders inside a campaign-linked realm
-- (idempotent; matches db:push state)

ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
CREATE INDEX IF NOT EXISTS "folders_owner_user_id_idx" ON "folders" ("owner_user_id");
