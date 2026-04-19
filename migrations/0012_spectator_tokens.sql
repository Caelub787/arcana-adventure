-- Spectator share-link tokens
-- Adds the spectator_tokens table used for tokenized public read-only
-- battlemap access (Task #38). One token per campaign, unique by token.

CREATE TABLE IF NOT EXISTS "spectator_tokens" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "campaign_id" varchar NOT NULL,
    "token" varchar NOT NULL,
    "created_by" varchar,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "spectator_tokens_campaign_id_unique" UNIQUE("campaign_id"),
    CONSTRAINT "spectator_tokens_token_unique" UNIQUE("token")
);

DO $$ BEGIN
    ALTER TABLE "spectator_tokens"
    ADD CONSTRAINT "spectator_tokens_campaign_id_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "spectator_tokens"
    ADD CONSTRAINT "spectator_tokens_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
