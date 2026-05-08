-- Crafter recipes: optional custom-skill restriction + resource costs
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "require_custom_skill" boolean DEFAULT false NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "required_skill_name" text DEFAULT '' NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "required_skill_min_value" integer DEFAULT 0 NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_energy_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_energy" integer DEFAULT 0 NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_mana_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_mana" integer DEFAULT 0 NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_hp_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "cost_hp" integer DEFAULT 0 NOT NULL;
