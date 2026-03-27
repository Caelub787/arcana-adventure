ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "show_hp_bar" boolean NOT NULL DEFAULT true;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "show_energy_bar" boolean NOT NULL DEFAULT true;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "show_mana_bar" boolean NOT NULL DEFAULT true;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "class_skill_points" integer NOT NULL DEFAULT 0;
