ALTER TYPE "public"."item_status" ADD VALUE 'ready' BEFORE 'building';--> statement-breakpoint
CREATE TABLE "item_dependencies" (
	"item_id" integer NOT NULL,
	"depends_on_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_dependencies_pk" PRIMARY KEY("item_id","depends_on_id"),
	CONSTRAINT "item_dependencies_no_self_reference" CHECK ("item_dependencies"."item_id" <> "item_dependencies"."depends_on_id")
);
--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dependencies" ADD CONSTRAINT "item_dependencies_depends_on_id_items_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_dependencies_depends_on_idx" ON "item_dependencies" USING btree ("depends_on_id");