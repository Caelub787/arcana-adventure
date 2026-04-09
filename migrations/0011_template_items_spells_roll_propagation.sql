-- Template Items & Spells with Roll Propagation
-- Adds template linking columns for roll propagation between template items/spells and their copies

ALTER TABLE items ADD COLUMN IF NOT EXISTS template_item_id VARCHAR REFERENCES items(id) ON DELETE SET NULL;

ALTER TABLE spells ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE spells ADD COLUMN IF NOT EXISTS campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE spells ADD COLUMN IF NOT EXISTS template_spell_id VARCHAR REFERENCES spells(id) ON DELETE SET NULL;
ALTER TABLE spells ALTER COLUMN character_id DROP NOT NULL;

ALTER TABLE roll_entries ADD COLUMN IF NOT EXISTS from_template_roll_id VARCHAR REFERENCES roll_entries(id) ON DELETE SET NULL;
