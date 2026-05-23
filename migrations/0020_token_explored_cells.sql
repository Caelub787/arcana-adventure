ALTER TABLE "tokens" ADD COLUMN IF NOT EXISTS "explored_cells" text[] DEFAULT ARRAY[]::text[] NOT NULL;
