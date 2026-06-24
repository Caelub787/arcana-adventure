-- AA V3: ammunition-type definitions + per-item ammunition-type reference.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "v3_ammunition_types" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "system" text NOT NULL DEFAULT 'aa-v3',
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "ammunition_type_id" varchar;
