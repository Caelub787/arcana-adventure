CREATE TABLE IF NOT EXISTS world_collaborators (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id VARCHAR NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(world_id, user_id)
);

CREATE TABLE IF NOT EXISTS entity_access (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id VARCHAR NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level VARCHAR NOT NULL DEFAULT 'view',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_world_collaborators_world_id ON world_collaborators(world_id);
CREATE INDEX IF NOT EXISTS idx_world_collaborators_user_id ON world_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_access_entity_id ON entity_access(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_access_user_id ON entity_access(user_id);
