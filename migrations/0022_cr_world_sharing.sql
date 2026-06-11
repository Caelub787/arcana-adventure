-- CR world sharing: per-node privacy, per-player edit grants, campaign link
-- (idempotent; matches db:push state)

ALTER TABLE "realms" ADD COLUMN IF NOT EXISTS "linked_campaign_id" text;
CREATE INDEX IF NOT EXISTS "realms_linked_campaign_id_idx" ON "realms" ("linked_campaign_id");

ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "is_private" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "node_edit_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "node_edit_grants"
    ADD CONSTRAINT "node_edit_grants_node_id_nodes_id_fk"
    FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "node_edit_grants_node_user_idx" ON "node_edit_grants" ("node_id", "user_id");
CREATE INDEX IF NOT EXISTS "node_edit_grants_user_idx" ON "node_edit_grants" ("user_id");
