-- Crafter Recipe Templates: shared recipe lists that can be linked to crafter items.
CREATE TABLE IF NOT EXISTS "crafter_recipe_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "system" text DEFAULT 'aa-v2' NOT NULL,
  "owner_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crafter_template_links" (
  "item_id" varchar NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "template_id" varchar NOT NULL REFERENCES "crafter_recipe_templates"("id") ON DELETE CASCADE,
  PRIMARY KEY ("item_id", "template_id")
);

-- Allow recipes to live on a template instead of an item.
ALTER TABLE "craft_recipes" ALTER COLUMN "parent_item_id" DROP NOT NULL;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "parent_template_id" varchar REFERENCES "crafter_recipe_templates"("id") ON DELETE CASCADE;
ALTER TABLE "craft_recipes" ADD COLUMN IF NOT EXISTS "from_template_recipe_id" varchar;
