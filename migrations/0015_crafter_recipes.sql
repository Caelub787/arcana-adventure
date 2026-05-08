CREATE TABLE IF NOT EXISTS "craft_recipes" (
"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"parent_item_id" varchar NOT NULL,
"name" text DEFAULT 'Recipe' NOT NULL,
"description" text DEFAULT '' NOT NULL,
"output_item_id" varchar,
"output_quantity" integer DEFAULT 1 NOT NULL,
"no_roll" boolean DEFAULT false NOT NULL,
"dice_formula" text DEFAULT '1d20' NOT NULL,
"attribute" text DEFAULT 'none' NOT NULL,
"mod" integer DEFAULT 0 NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "craft_recipe_ingredients" (
"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"recipe_id" varchar NOT NULL,
"item_id" varchar,
"item_name" text DEFAULT '' NOT NULL,
"quantity" integer DEFAULT 1 NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "craft_recipe_outcomes" (
"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"recipe_id" varchar NOT NULL,
"trigger_kind" text DEFAULT 'range' NOT NULL,
"min_total" integer,
"max_total" integer,
"override_output_item_id" varchar,
"override_output_quantity" integer,
"override_durability" integer,
"consume_ingredients" boolean DEFAULT true NOT NULL,
"label" text,
"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipes" ADD CONSTRAINT "craft_recipes_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipes" ADD CONSTRAINT "craft_recipes_output_item_id_items_id_fk" FOREIGN KEY ("output_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipe_ingredients" ADD CONSTRAINT "craft_recipe_ingredients_recipe_id_craft_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."craft_recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipe_ingredients" ADD CONSTRAINT "craft_recipe_ingredients_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipe_outcomes" ADD CONSTRAINT "craft_recipe_outcomes_recipe_id_craft_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."craft_recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "craft_recipe_outcomes" ADD CONSTRAINT "craft_recipe_outcomes_override_output_item_id_items_id_fk" FOREIGN KEY ("override_output_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
