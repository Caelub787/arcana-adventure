-- Task #328: V3 My Library parity — personal (GM-owned) crafted-spell canonical
-- rows and element requirements. NULL owner = global/admin row.

ALTER TABLE v3_spells ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE v3_element_requirements ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
