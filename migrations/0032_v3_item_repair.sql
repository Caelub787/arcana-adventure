-- AA V3 repair restructure: move repair cost (ingredients + restore amount)
-- onto each item; the crafter's repair recipe only declares which advanced
-- item types it can repair (multi-select).

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "repair_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "repair_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "repair_target_type_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;

-- Carry any existing single-type repair recipes into the new multi-type column.
UPDATE "craft_recipes"
SET "repair_target_type_ids" = ARRAY["repair_target_type_id"]
WHERE "is_repair_recipe" = true
  AND "repair_target_type_id" IS NOT NULL
  AND ("repair_target_type_ids" IS NULL OR cardinality("repair_target_type_ids") = 0);
