-- AA V3 technique unlock rework: techniques are no longer granted through
-- skill trees. Players spend a class skill point on the weapon item's Unlock
-- button; unlocked technique ids are stored globally on the character so the
-- same technique works from every weapon that grants it.

ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "v3_unlocked_technique_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;
