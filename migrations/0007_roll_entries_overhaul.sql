ALTER TABLE roll_entries ADD COLUMN IF NOT EXISTS save_dc_type TEXT DEFAULT 'value';
ALTER TABLE roll_entries ADD COLUMN IF NOT EXISTS save_dc_attribute TEXT;
ALTER TABLE roll_entries ADD COLUMN IF NOT EXISTS stat_direction TEXT DEFAULT 'subtract';
