-- Personal library: add ownerUserId to tables that lacked it so non-admin
-- players can create private copies of every content type an admin can.
-- All columns are nullable (NULL = global/admin-owned row).

ALTER TABLE system_skills ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE system_traits ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE token_effects ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE v3_techniques ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE v3_technique_groups ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE v3_action_token_types ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE advanced_item_types ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE v3_ammunition_types ADD COLUMN IF NOT EXISTS owner_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
