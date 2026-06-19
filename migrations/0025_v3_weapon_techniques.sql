-- AA V3 weapon base attack & techniques (Task #180). Idempotent.

ALTER TABLE "items"
  ADD COLUMN IF NOT EXISTS "v3_technique_group_ids" text[] DEFAULT ARRAY[]::text[];

CREATE TABLE IF NOT EXISTS "v3_techniques" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "image" text,
  "description" text,
  "energy_cost" integer NOT NULL DEFAULT 0,
  "roll_mode" text NOT NULL DEFAULT 'base_damage',
  "skill_key" text,
  "requirements" jsonb DEFAULT '[]'::jsonb,
  "system" text NOT NULL DEFAULT 'aa-v3',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "v3_technique_groups" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "system" text NOT NULL DEFAULT 'aa-v3',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "v3_technique_group_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" varchar NOT NULL REFERENCES "v3_technique_groups"("id") ON DELETE CASCADE,
  "technique_id" varchar NOT NULL REFERENCES "v3_techniques"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "v3_technique_group_members_group_idx"
  ON "v3_technique_group_members" ("group_id");
CREATE UNIQUE INDEX IF NOT EXISTS "v3_technique_group_members_unique_idx"
  ON "v3_technique_group_members" ("group_id", "technique_id");
