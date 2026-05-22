ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "temp_hp" integer DEFAULT 0 NOT NULL;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "temp_energy" integer DEFAULT 0 NOT NULL;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "temp_mana" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaign_members" ADD COLUMN IF NOT EXISTS "trusted_player" boolean DEFAULT false NOT NULL;
