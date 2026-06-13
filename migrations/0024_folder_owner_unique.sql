-- CR personal folders: enforce at most one personal folder per (realm, user).
-- Partial unique index so normal shared folders (owner_user_id IS NULL) are
-- unconstrained. Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS "folders_realm_owner_user_id_uniq"
  ON "folders" ("realm_id", "owner_user_id")
  WHERE "owner_user_id" IS NOT NULL;
