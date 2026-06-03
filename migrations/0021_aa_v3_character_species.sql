-- AA V3: 6-attribute model + species defaults (idempotent; matches db:push state)
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "constitution" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "anemos" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "intelligence" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "v3_skills" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "system_species" ADD COLUMN IF NOT EXISTS "attribute_bonuses" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "system_species" ADD COLUMN IF NOT EXISTS "default_custom_skills" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "system_species" ADD COLUMN IF NOT EXISTS "default_traits" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "campaign_species" ADD COLUMN IF NOT EXISTS "attribute_bonuses" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_species" ADD COLUMN IF NOT EXISTS "default_custom_skills" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "campaign_species" ADD COLUMN IF NOT EXISTS "default_traits" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "character_custom_skills" ADD COLUMN IF NOT EXISTS "from_species_id" varchar;
ALTER TABLE "character_traits" ADD COLUMN IF NOT EXISTS "from_species_id" varchar;
