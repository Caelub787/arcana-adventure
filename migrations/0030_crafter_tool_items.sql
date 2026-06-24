-- Crafter recipes: optional required inventory items ("tools") to craft/repair.
-- Each entry: { itemId, name, consumed }. consumed=true is removed on use.
ALTER TABLE craft_recipes
  ADD COLUMN IF NOT EXISTS tool_items jsonb NOT NULL DEFAULT '[]'::jsonb;
