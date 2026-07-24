-- AA V3 free hotbar: per-user, per-campaign loadouts (9 loadouts x 5 slots).
CREATE TABLE IF NOT EXISTS "free_hotbar_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign_id" varchar NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "loadout_index" integer NOT NULL,
  "slot_index" integer NOT NULL,
  "character_id" varchar REFERENCES "characters"("id") ON DELETE CASCADE,
  "item_id" varchar REFERENCES "items"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "free_hotbar_user_campaign_loadout_slot_unique"
  ON "free_hotbar_entries" ("user_id", "campaign_id", "loadout_index", "slot_index");
