-- AA V2 Foundation: Mana system, class tables, and mana cost fields
-- Note: These changes may already exist in the database via db:push

ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "mana" integer DEFAULT 0 NOT NULL;
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "max_mana" integer DEFAULT 0 NOT NULL;

ALTER TABLE "spells" ADD COLUMN IF NOT EXISTS "mana_cost" integer DEFAULT 0;

ALTER TABLE "system_spells" ADD COLUMN IF NOT EXISTS "mana_cost" integer DEFAULT 0 NOT NULL;

ALTER TABLE "roll_entries" ADD COLUMN IF NOT EXISTS "requires_mana" boolean DEFAULT false;
ALTER TABLE "roll_entries" ADD COLUMN IF NOT EXISTS "mana_cost" integer;

CREATE TABLE IF NOT EXISTS "classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"system" text DEFAULT 'aa-v2' NOT NULL,
	"grid_width" integer DEFAULT 7 NOT NULL,
	"grid_height" integer DEFAULT 10 NOT NULL,
	"default_view_x" integer,
	"default_view_y" integer,
	"default_view_zoom" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "class_skill_nodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" varchar NOT NULL,
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

CREATE TABLE IF NOT EXISTS "class_skill_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" varchar NOT NULL,
	"from_node_id" varchar NOT NULL,
	"to_node_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "character_classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"class_id" varchar NOT NULL,
	"class_level" integer DEFAULT 1 NOT NULL,
	"class_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "character_class_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" varchar NOT NULL,
	"class_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "class_skill_nodes" ADD CONSTRAINT "class_skill_nodes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "class_skill_connections" ADD CONSTRAINT "class_skill_connections_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "class_skill_connections" ADD CONSTRAINT "class_skill_connections_from_node_id_class_skill_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."class_skill_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "class_skill_connections" ADD CONSTRAINT "class_skill_connections_to_node_id_class_skill_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."class_skill_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "character_class_skills" ADD CONSTRAINT "character_class_skills_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "character_class_skills" ADD CONSTRAINT "character_class_skills_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "character_class_skills" ADD CONSTRAINT "character_class_skills_node_id_class_skill_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."class_skill_nodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "character_classes_char_class_unique" ON "character_classes" ("character_id", "class_id");
CREATE UNIQUE INDEX IF NOT EXISTS "character_class_skills_unique" ON "character_class_skills" ("character_id", "class_id", "node_id");
