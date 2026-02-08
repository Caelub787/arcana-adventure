CREATE TABLE "roll_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" varchar NOT NULL,
	"name" text NOT NULL,
	"roll_type" text NOT NULL,
	"dice_formula" text,
	"mod" integer DEFAULT 0,
	"damage_type" text,
	"attribute" text,
	"apply_to_stat" text DEFAULT 'none',
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_actors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"template_id" varchar,
	"folder_id" varchar,
	"name" text NOT NULL,
	"data" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"parent_id" varchar,
	"name" text NOT NULL,
	"color" varchar(20),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"folder_id" varchar,
	"name" text NOT NULL,
	"data" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_doors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"x2" real NOT NULL,
	"y2" real NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"blocks_vision_when_closed" boolean DEFAULT true NOT NULL,
	"blocks_movement_when_closed" boolean DEFAULT true NOT NULL,
	"snap_to_grid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_lights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"radius" integer DEFAULT 30 NOT NULL,
	"color" text DEFAULT '#ffcc44' NOT NULL,
	"intensity" real DEFAULT 1 NOT NULL,
	"soft_edge" boolean DEFAULT true NOT NULL,
	"flicker" boolean DEFAULT false NOT NULL,
	"flicker_speed" real DEFAULT 1 NOT NULL,
	"attachment_type" text DEFAULT 'static' NOT NULL,
	"attached_token_id" varchar,
	"attached_item_id" varchar,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_walls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"x2" real NOT NULL,
	"y2" real NOT NULL,
	"wall_type" text DEFAULT 'solid' NOT NULL,
	"one_way_direction" text,
	"snap_to_grid" boolean DEFAULT true NOT NULL,
	"player_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_windows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" varchar NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"x2" real NOT NULL,
	"y2" real NOT NULL,
	"shutter_closed" boolean DEFAULT false NOT NULL,
	"snap_to_grid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "system" text DEFAULT 'arcana-adventure' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "default_panel" text DEFAULT 'characters';--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "vision_modifier" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "vision_modifier_time" text DEFAULT 'both';--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "vision_override_type" text;--> statement-breakpoint
ALTER TABLE "character_traits" ADD COLUMN "vision_override_toggle" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "vision_type" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "day_vision_distance" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "night_vision_distance" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "special_vision_notes" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_offset_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "grid_offset_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_explored_memory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_token_vision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_light_vision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_wall_blocking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_door_blocking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_opacity" real DEFAULT 0.85 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_explored_dimness" real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_texture" text DEFAULT 'solid' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "fog_state" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "is_day_time" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "global_light_level" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "vision_modifier" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "vision_modifier_time" text DEFAULT 'both';--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "vision_override_type" text;--> statement-breakpoint
ALTER TABLE "system_traits" ADD COLUMN "vision_override_toggle" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "is_blind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "vision_override_distance" integer;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "vision_override_type" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_radius" integer;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_color" text DEFAULT '#ffcc44';--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_intensity" real DEFAULT 1;--> statement-breakpoint
ALTER TABLE "sandbox_actors" ADD CONSTRAINT "sandbox_actors_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_actors" ADD CONSTRAINT "sandbox_actors_template_id_sandbox_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sandbox_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_actors" ADD CONSTRAINT "sandbox_actors_folder_id_sandbox_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."sandbox_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_folders" ADD CONSTRAINT "sandbox_folders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_folders" ADD CONSTRAINT "sandbox_folders_parent_id_sandbox_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sandbox_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_templates" ADD CONSTRAINT "sandbox_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_templates" ADD CONSTRAINT "sandbox_templates_folder_id_sandbox_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."sandbox_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_doors" ADD CONSTRAINT "scene_doors_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_lights" ADD CONSTRAINT "scene_lights_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_lights" ADD CONSTRAINT "scene_lights_attached_token_id_tokens_id_fk" FOREIGN KEY ("attached_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_walls" ADD CONSTRAINT "scene_walls_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_windows" ADD CONSTRAINT "scene_windows_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;