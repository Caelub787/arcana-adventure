-- AA V3 scrolls & runes (Task #198). Idempotent.

ALTER TABLE "items"
  ADD COLUMN IF NOT EXISTS "max_durability" integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "scroll_effect_mode" text NOT NULL DEFAULT 'spell',
  ADD COLUMN IF NOT EXISTS "scroll_knowledge_name" text,
  ADD COLUMN IF NOT EXISTS "scroll_knowledge_attribute" text DEFAULT 'intelligence',
  ADD COLUMN IF NOT EXISTS "scroll_knowledge_value" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "scroll_skill_key" text,
  ADD COLUMN IF NOT EXISTS "scroll_skill_amount" integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "rune_target_item_type" text DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS "rune_stat_effects" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rune_remove_durability_cost" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rune_unremovable" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rune_use_mode" text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "rune_skill_key" text,
  ADD COLUMN IF NOT EXISTS "rune_skill_adjustment" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rune_weapon_damage_level_bonus" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "socketed_runes" jsonb DEFAULT '[]'::jsonb;

-- Backfill max_durability for existing rows so it is never below current durability.
UPDATE "items" SET "max_durability" = GREATEST("max_durability", "durability");

ALTER TABLE "characters"
  ADD COLUMN IF NOT EXISTS "v3_skill_boosts" jsonb NOT NULL DEFAULT '{}'::jsonb;
