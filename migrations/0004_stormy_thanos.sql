CREATE TABLE "campaign_species" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_image" text,
	"lifespan" integer DEFAULT 100 NOT NULL,
	"speed" integer DEFAULT 30 NOT NULL,
	"fly_speed" integer DEFAULT 0 NOT NULL,
	"size" text DEFAULT 'Medium' NOT NULL,
	"natural_armor" integer DEFAULT 5 NOT NULL,
	"size_bonus" integer DEFAULT 0 NOT NULL,
	"starting_hp" integer DEFAULT 10 NOT NULL,
	"starting_max_hp" integer DEFAULT 10 NOT NULL,
	"hp_per_level" integer DEFAULT 5 NOT NULL,
	"starting_energy" integer DEFAULT 10 NOT NULL,
	"starting_max_energy" integer DEFAULT 10 NOT NULL,
	"energy_per_level" integer DEFAULT 6 NOT NULL,
	"carry_weight" integer DEFAULT 50 NOT NULL,
	"feat_tree" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_template_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar NOT NULL,
	"recipient_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"friend_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_effects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"effect_id" varchar NOT NULL,
	"trigger_condition" text DEFAULT 'always' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"campaign_id" varchar,
	"parent_id" varchar,
	"name" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_references" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"label" text,
	"position" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" varchar,
	"folder_id" varchar,
	"owner_id" varchar NOT NULL,
	"shared_with_id" varchar NOT NULL,
	"permission" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"campaign_id" varchar,
	"folder_id" varchar,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'note' NOT NULL,
	"canvas_data" jsonb,
	"icon" text,
	"cover_image" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spell_effects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spell_id" varchar NOT NULL,
	"effect_id" varchar NOT NULL,
	"trigger_condition" text DEFAULT 'always' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thrown_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"character_id" varchar NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"attached_to_token_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_active_effects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" varchar NOT NULL,
	"effect_id" varchar NOT NULL,
	"source_type" text,
	"source_id" varchar,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "token_effects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"description" text,
	"timing" text DEFAULT 'start_of_turn' NOT NULL,
	"causes_damage" boolean DEFAULT false NOT NULL,
	"damage_type" text,
	"dice_amount" text,
	"has_duration" boolean DEFAULT false NOT NULL,
	"default_duration" integer,
	"duration_type" text DEFAULT 'turns',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD COLUMN "gm_hotbar" text[];--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "uses_per_short_rest" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "damage_modifier_type" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "damage_modifier_damage_type" text;--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "damage_modifier_value" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bonus_energy_from_level_ups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "last_energy_level_up_rolled" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "folder_id" varchar;--> statement-breakpoint
ALTER TABLE "feat_trees" ADD COLUMN "default_view_x" integer;--> statement-breakpoint
ALTER TABLE "feat_trees" ADD COLUMN "default_view_y" integer;--> statement-breakpoint
ALTER TABLE "feat_trees" ADD COLUMN "default_view_zoom" real;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_throwable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_aoe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_aoe_shape" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_aoe_range" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_aoe_damage" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_aoe_damage_type" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "throwable_break_chance" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "can_apply_effects" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "folder_id" varchar;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "is_attack" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "gain_energy" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "system_species" ADD COLUMN "energy_per_level" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_spells" ADD COLUMN "gain_energy" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "system_spells" ADD COLUMN "is_attack" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "uses_per_short_rest" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "damage_modifier_type" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "damage_modifier_damage_type" text;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "damage_modifier_value" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "scene_id" varchar;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "is_invisible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "campaign_species" ADD CONSTRAINT "campaign_species_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_folders" ADD CONSTRAINT "character_folders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_effects" ADD CONSTRAINT "item_effects_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_effects" ADD CONSTRAINT "item_effects_effect_id_token_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."token_effects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_parent_id_note_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."note_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_references" ADD CONSTRAINT "note_references_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_folder_id_note_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_shared_with_id_users_id_fk" FOREIGN KEY ("shared_with_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_note_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_folders" ADD CONSTRAINT "scene_folders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_effects" ADD CONSTRAINT "spell_effects_spell_id_system_spells_id_fk" FOREIGN KEY ("spell_id") REFERENCES "public"."system_spells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spell_effects" ADD CONSTRAINT "spell_effects_effect_id_token_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."token_effects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thrown_items" ADD CONSTRAINT "thrown_items_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thrown_items" ADD CONSTRAINT "thrown_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thrown_items" ADD CONSTRAINT "thrown_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thrown_items" ADD CONSTRAINT "thrown_items_attached_to_token_id_tokens_id_fk" FOREIGN KEY ("attached_to_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_active_effects" ADD CONSTRAINT "token_active_effects_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_active_effects" ADD CONSTRAINT "token_active_effects_effect_id_token_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."token_effects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_sender_recipient_unique" ON "friend_requests" USING btree ("sender_id","recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_user_friend_unique" ON "friendships" USING btree ("user_id","friend_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;