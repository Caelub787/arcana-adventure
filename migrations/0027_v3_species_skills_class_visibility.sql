-- AA V3: per-species skill bonuses + per-class visibility gating.
-- Idempotent: safe to re-run.

ALTER TABLE "system_species" ADD COLUMN IF NOT EXISTS "skill_bonuses" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_species" ADD COLUMN IF NOT EXISTS "skill_bonuses" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "visibility_mode" text DEFAULT 'all' NOT NULL;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "required_item_id" text;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "required_knowledge_name" text;
