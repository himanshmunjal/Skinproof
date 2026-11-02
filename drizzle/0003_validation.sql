CREATE TYPE "public"."experiment_kind" AS ENUM('no_change', 'concealer', 'flush');--> statement-breakpoint
ALTER TYPE "public"."scan_context" ADD VALUE 'validation';--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "experiment_kind" NOT NULL,
	"before_scan_id" uuid NOT NULL,
	"after_scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_before_scan_id_scans_id_fk" FOREIGN KEY ("before_scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_after_scan_id_scans_id_fk" FOREIGN KEY ("after_scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiments_user_idx" ON "experiments" USING btree ("user_id");