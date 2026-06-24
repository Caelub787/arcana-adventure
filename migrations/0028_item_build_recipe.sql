ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "is_build_recipe" boolean DEFAULT false NOT NULL;
