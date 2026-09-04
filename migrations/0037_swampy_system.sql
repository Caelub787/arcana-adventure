-- Swampy system: a fork of C.A. with its own library scope (system slug
-- 'swampy') and its own copies of the C.A.-shaped per-character columns, so
-- the two systems' wound/body/pool mechanics can diverge independently.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_wounds" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_body_sex" text NOT NULL DEFAULT 'male';
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "swampy_energy_pool" integer NOT NULL DEFAULT 0;

-- Backfill the two C.A. columns that were only ever created by db:push, so a
-- database that missed that push is repaired here too.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "ca_body_sex" text NOT NULL DEFAULT 'male';
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "ca_energy_pool" integer NOT NULL DEFAULT 0;
