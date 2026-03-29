CREATE TYPE "public"."agent_run_review_status" AS ENUM('pending', 'approved', 'changes_requested', 'no_reviews');--> statement-breakpoint
CREATE TABLE "metadata" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "metadata" ("key", "value") VALUES ('paused', 'false');--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "review_status" "agent_run_review_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "repo" varchar(255);
