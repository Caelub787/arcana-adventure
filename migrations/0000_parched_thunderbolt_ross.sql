CREATE TABLE "campaign_members" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "role" text DEFAULT 'player' NOT NULL,
        "favorite" boolean DEFAULT false NOT NULL,
        "joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "invite_code" text NOT NULL,
        "gm_user_id" varchar NOT NULL,
        "grid_size" integer DEFAULT 50 NOT NULL,
        "current_map" text,
        "active_scene_id" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "last_played" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "campaigns_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "characters" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "name" text NOT NULL,
        "portrait" text,
        "class" text NOT NULL,
        "level" integer DEFAULT 1 NOT NULL,
        "hp" integer NOT NULL,
        "max_hp" integer NOT NULL,
        "energy" integer NOT NULL,
        "max_energy" integer NOT NULL,
        "race" text DEFAULT 'Human' NOT NULL,
        "size" text DEFAULT 'Medium' NOT NULL,
        "size_bonus" integer DEFAULT 0 NOT NULL,
        "natural_armor" integer DEFAULT 5 NOT NULL,
        "speed" integer DEFAULT 30 NOT NULL,
        "fly_speed" integer DEFAULT 0 NOT NULL,
        "lifespan" integer DEFAULT 100 NOT NULL,
        "agility" integer DEFAULT 0 NOT NULL,
        "charisma" integer DEFAULT 0 NOT NULL,
        "strength" integer DEFAULT 0 NOT NULL,
        "wisdom" integer DEFAULT 0 NOT NULL,
        "arcana" integer DEFAULT 0 NOT NULL,
        "concentration" integer DEFAULT 0 NOT NULL,
        "skill_agility" integer DEFAULT 0 NOT NULL,
        "skill_arcana" integer DEFAULT 0 NOT NULL,
        "skill_charisma" integer DEFAULT 0 NOT NULL,
        "skill_concentration" integer DEFAULT 0 NOT NULL,
        "skill_deception" integer DEFAULT 0 NOT NULL,
        "skill_history" integer DEFAULT 0 NOT NULL,
        "skill_intimidation" integer DEFAULT 0 NOT NULL,
        "skill_investigation" integer DEFAULT 0 NOT NULL,
        "skill_medicine" integer DEFAULT 0 NOT NULL,
        "skill_perception" integer DEFAULT 0 NOT NULL,
        "skill_sleight_of_hand" integer DEFAULT 0 NOT NULL,
        "skill_stealth" integer DEFAULT 0 NOT NULL,
        "skill_strength" integer DEFAULT 0 NOT NULL,
        "skill_wisdom" integer DEFAULT 0 NOT NULL,
        "skill_culture" integer DEFAULT 0 NOT NULL,
        "biography" text,
        "gm_notes" text,
        "inventory" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar NOT NULL,
        "user_id" varchar,
        "sender" text NOT NULL,
        "text" text NOT NULL,
        "type" text DEFAULT 'chat' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotbars" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "character_id" varchar NOT NULL,
        "hotbar_type" text NOT NULL,
        "slot_number" integer NOT NULL,
        "item_id" varchar,
        "spell_id" varchar,
        "skill_name" text
);
--> statement-breakpoint
CREATE TABLE "items" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "character_id" varchar NOT NULL,
        "container_id" varchar,
        "name" text NOT NULL,
        "image" text,
        "description" text,
        "damage" text,
        "damage_type" text,
        "mod" integer DEFAULT 0,
        "range" integer,
        "aoe" text,
        "attribute" text,
        "size" text,
        "weight" text DEFAULT 'light',
        "price_copper" integer DEFAULT 0 NOT NULL,
        "price_silver" integer DEFAULT 0 NOT NULL,
        "price_gold" integer DEFAULT 0 NOT NULL,
        "price_platinum" integer DEFAULT 0 NOT NULL,
        "item_weight" real DEFAULT 0 NOT NULL,
        "quantity" integer DEFAULT 1 NOT NULL,
        "durability" integer DEFAULT 10 NOT NULL,
        "item_type" text NOT NULL,
        "rarity" text DEFAULT 'common' NOT NULL,
        "is_container" boolean DEFAULT false NOT NULL,
        "carry_capacity" integer DEFAULT 0,
        "is_equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "token" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar NOT NULL,
        "name" text NOT NULL,
        "background_image" text,
        "grid_enabled" boolean DEFAULT true NOT NULL,
        "grid_type" text DEFAULT 'square' NOT NULL,
        "grid_size" integer DEFAULT 50 NOT NULL,
        "default_view_x" integer DEFAULT 0 NOT NULL,
        "default_view_y" integer DEFAULT 0 NOT NULL,
        "default_view_zoom" real DEFAULT 1 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spells" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "character_id" varchar NOT NULL,
        "name" text NOT NULL,
        "image" text,
        "description" text,
        "damage" text,
        "damage_type" text,
        "range" integer,
        "aoe" text,
        "casting_time" text,
        "duration" text,
        "level" integer DEFAULT 0 NOT NULL,
        "school" text,
        "is_equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar NOT NULL,
        "character_id" varchar,
        "type" text NOT NULL,
        "x" integer NOT NULL,
        "y" integer NOT NULL,
        "image" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "username" text NOT NULL,
        "name" text NOT NULL,
        "password" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email"),
        CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_gm_user_id_users_id_fk" FOREIGN KEY ("gm_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotbars" ADD CONSTRAINT "hotbars_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotbars" ADD CONSTRAINT "hotbars_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotbars" ADD CONSTRAINT "hotbars_spell_id_spells_id_fk" FOREIGN KEY ("spell_id") REFERENCES "public"."spells"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_container_id_items_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spells" ADD CONSTRAINT "spells_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;