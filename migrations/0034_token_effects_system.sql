-- Add system tag to token_effects so V3 campaigns can have their own isolated
-- effect pool separate from the legacy arcana-adventure pool.
-- Existing rows are backfilled with 'arcana-adventure' (the default).
-- Idempotent: safe to run multiple times.
ALTER TABLE token_effects ADD COLUMN IF NOT EXISTS system text NOT NULL DEFAULT 'arcana-adventure';
