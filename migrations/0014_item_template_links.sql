CREATE TABLE IF NOT EXISTS "item_template_links" (
	"item_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	CONSTRAINT "item_template_links_item_id_template_id_pk" PRIMARY KEY("item_id","template_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_template_links" ADD CONSTRAINT "item_template_links_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_template_links" ADD CONSTRAINT "item_template_links_template_id_items_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
