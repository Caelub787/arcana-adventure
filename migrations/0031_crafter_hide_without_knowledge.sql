-- Per-recipe option to hide a craft from players who lack its required knowledge.
-- Default false: all crafts are visible to everyone (GMs always see every recipe).
ALTER TABLE craft_recipes
  ADD COLUMN IF NOT EXISTS hide_without_knowledge boolean NOT NULL DEFAULT false;
