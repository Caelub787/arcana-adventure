CREATE TABLE "campaign_bans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"banned_at" timestamp DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "character_custom_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"system_skill_id" varchar,
	"name" text NOT NULL,
	"parent_attribute" text DEFAULT 'wit' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_feats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"feat_id" varchar NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"access_level" text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_traits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"system_trait_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"parent_attribute" text DEFAULT 'will' NOT NULL,
	"uses_per_long_rest" integer DEFAULT 1 NOT NULL,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feat_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" varchar NOT NULL,
	"from_feat_id" varchar NOT NULL,
	"to_feat_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feat_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"tier" integer DEFAULT 1 NOT NULL,
	"cost" integer DEFAULT 1 NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feat_trees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"grid_width" integer DEFAULT 7 NOT NULL,
	"grid_height" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" varchar NOT NULL,
	"template_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"grid_x" integer DEFAULT 0 NOT NULL,
	"grid_y" integer DEFAULT 0 NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"cost" integer DEFAULT 1 NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"character_id" varchar NOT NULL,
	"value" integer NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_attribute" text DEFAULT 'wit' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_species" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_name" text DEFAULT 'Arcana Adventure' NOT NULL,
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
	"carry_weight" integer DEFAULT 50 NOT NULL,
	"feat_tree" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_spells" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"school" text DEFAULT 'Evocation' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"casting_time" text DEFAULT '1 action' NOT NULL,
	"range" text DEFAULT '30 ft' NOT NULL,
	"range_num" integer DEFAULT 30,
	"duration" text DEFAULT 'Instantaneous' NOT NULL,
	"components" text DEFAULT 'V, S' NOT NULL,
	"damage_type" text,
	"damage_dice" text,
	"mod" integer DEFAULT 0,
	"attribute" text,
	"healing_dice" text,
	"energy_cost" integer DEFAULT 1 NOT NULL,
	"concentration" boolean DEFAULT false NOT NULL,
	"ritual" boolean DEFAULT false NOT NULL,
	"target_type" text DEFAULT 'single' NOT NULL,
	"area_size" text,
	"aoe" text,
	"is_aoe" boolean DEFAULT false,
	"aoe_range" integer,
	"aoe_shape" text,
	"saving_throw" text,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_traits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_attribute" text DEFAULT 'will' NOT NULL,
	"uses_per_long_rest" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ALTER COLUMN "class" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "characters" ALTER COLUMN "class" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "character_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "x" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "y" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD COLUMN "assigned_character_id" varchar;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "feat_tree" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bonus_hp_from_level_ups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "last_level_up_rolled" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "might" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "finesse" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "wit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "presence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "will" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "craft" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "skill_survival" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "skill_beast_handling" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "exhaustion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hotbars" ADD COLUMN "trait_id" varchar;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "campaign_id" varchar;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "rules_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_heavy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ammunition_type" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "weapon_category" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "break_chance" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "currency" text DEFAULT 'copper' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "armor_slot" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "armor_bonus" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "damage_reduction" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "damage_reduction_type" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ration_servings" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_damaging" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_color" text DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_thickness" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_opacity" real DEFAULT 0.4 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "default_view_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "in_combat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "current_turn_character_id" varchar;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "damage_dice" text;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "healing_dice" text;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "range_num" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "mod" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "attribute" text;--> statement-breakpoint
ALTER TABLE "spells" ADD COLUMN "energy_cost" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "campaign_bans" ADD CONSTRAINT "campaign_bans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_bans" ADD CONSTRAINT "campaign_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_custom_skills" ADD CONSTRAINT "character_custom_skills_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_custom_skills" ADD CONSTRAINT "character_custom_skills_system_skill_id_system_skills_id_fk" FOREIGN KEY ("system_skill_id") REFERENCES "public"."system_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_feats" ADD CONSTRAINT "character_feats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_feats" ADD CONSTRAINT "character_feats_feat_id_feats_id_fk" FOREIGN KEY ("feat_id") REFERENCES "public"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_permissions" ADD CONSTRAINT "character_permissions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_permissions" ADD CONSTRAINT "character_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_traits" ADD CONSTRAINT "character_traits_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_traits" ADD CONSTRAINT "character_traits_system_trait_id_system_traits_id_fk" FOREIGN KEY ("system_trait_id") REFERENCES "public"."system_traits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_connections" ADD CONSTRAINT "feat_connections_tree_id_feat_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."feat_trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_connections" ADD CONSTRAINT "feat_connections_from_feat_id_feats_id_fk" FOREIGN KEY ("from_feat_id") REFERENCES "public"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feat_connections" ADD CONSTRAINT "feat_connections_to_feat_id_feats_id_fk" FOREIGN KEY ("to_feat_id") REFERENCES "public"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feats" ADD CONSTRAINT "feats_tree_id_feat_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."feat_trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feats" ADD CONSTRAINT "feats_template_id_feat_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."feat_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_entries" ADD CONSTRAINT "initiative_entries_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_entries" ADD CONSTRAINT "initiative_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_custom_skills_char_name_unique" ON "character_custom_skills" USING btree ("character_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "character_feats_char_feat_unique" ON "character_feats" USING btree ("character_id","feat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_permissions_char_user_unique" ON "character_permissions" USING btree ("character_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_entries_scene_char_unique" ON "initiative_entries" USING btree ("scene_id","character_id");--> statement-breakpoint
ALTER TABLE "hotbars" ADD CONSTRAINT "hotbars_trait_id_character_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."character_traits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;