ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bonus_max_hp" integer DEFAULT 0 NOT NULL;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bonus_max_energy" integer DEFAULT 0 NOT NULL;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bonus_max_mana" integer DEFAULT 0 NOT NULL;
