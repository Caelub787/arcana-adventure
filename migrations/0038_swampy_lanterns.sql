-- Swampy ("The Lanterns Beyond the Veil"): Daggerheart's resource model plus
-- Warrens, the Working Ledger, and the Deck of Houses.
--
-- The swampy_wounds / swampy_body_sex / swampy_energy_pool columns from 0037
-- are deliberately left in place. Swampy used C.A.'s pinned-wound model while
-- it was a copy of it; HP + damage thresholds replaced that, but dropping the
-- columns would discard any character made in between.

-- Per-character Daggerheart state. HP itself reuses the shared hp/max_hp
-- columns; these are the parts that sit around it.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_hope" integer NOT NULL DEFAULT 2;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_strain" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_max_strain" integer NOT NULL DEFAULT 6;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_armour_slots" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_max_armour_slots" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_major_threshold" integer NOT NULL DEFAULT 8;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_severe_threshold" integer NOT NULL DEFAULT 16;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_experiences" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_warren_ids" text[] NOT NULL DEFAULT ARRAY[]::text[];

-- The GM's Fear pool is the table's, not any character's.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "swampy_fear" integer NOT NULL DEFAULT 0;

-- Warrens: living worlds, authored in the library or inside one campaign.
CREATE TABLE IF NOT EXISTS "swampy_warrens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "system" text NOT NULL DEFAULT 'swampy',
  "owner_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "image" text,
  "condition" text NOT NULL DEFAULT 'flourishing',
  "nature" text NOT NULL DEFAULT '',
  "paths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "houses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "scars" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "gm_notes" text NOT NULL DEFAULT '',
  "created_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "swampy_warrens_scope_idx" ON "swampy_warrens" ("system", "owner_user_id", "campaign_id");

-- The Working Ledger: precedents set during play, per campaign.
CREATE TABLE IF NOT EXISTS "swampy_workings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" varchar NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "warren_id" varchar REFERENCES "swampy_warrens"("id") ON DELETE SET NULL,
  "warren_name" text NOT NULL DEFAULT '',
  "method" text NOT NULL DEFAULT '',
  "effect" text NOT NULL DEFAULT '',
  "cost" text NOT NULL DEFAULT '',
  "limits" text NOT NULL DEFAULT '',
  "condition_interaction" text NOT NULL DEFAULT '',
  "risk" text NOT NULL DEFAULT '',
  "created_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "character_id" varchar REFERENCES "characters"("id") ON DELETE SET NULL,
  "character_name" text NOT NULL DEFAULT '',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "swampy_workings_campaign_idx" ON "swampy_workings" ("campaign_id");

-- Deck of Houses: the cards a reading is drawn from.
CREATE TABLE IF NOT EXISTS "swampy_house_cards" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "system" text NOT NULL DEFAULT 'swampy',
  "owner_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "house" text NOT NULL DEFAULT '',
  "image" text,
  "upright_meaning" text NOT NULL DEFAULT '',
  "reversed_meaning" text NOT NULL DEFAULT '',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "swampy_house_cards_scope_idx" ON "swampy_house_cards" ("system", "owner_user_id");
