CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."image_kind" AS ENUM('scan', 'mask', 'product');--> statement-breakpoint
CREATE TYPE "public"."product_source" AS ENUM('photo', 'text', 'url');--> statement-breakpoint
CREATE TYPE "public"."routine_slot" AS ENUM('am', 'pm', 'both', 'none');--> statement-breakpoint
CREATE TYPE "public"."scan_context" AS ENUM('routine', 'calibration', 'checkin', 'breakout', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."scan_mode" AS ENUM('sd', 'hd');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."trial_status" AS ENUM('active', 'completed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."usage_provider" AS ENUM('youcam', 'claude');--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"provider" "usage_provider" NOT NULL,
	"operation" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"text" text NOT NULL,
	"tool_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sleep_hours" real,
	"stress" integer,
	"water_l" real,
	"new_products" text,
	"diet" text,
	"cycle_day" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "image_kind" NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noise_profiles" (
	"user_id" uuid NOT NULL,
	"concern" text NOT NULL,
	"threshold" real NOT NULL,
	"n_pairs" integer DEFAULT 1 NOT NULL,
	"sum_sq_diff" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "noise_profiles_user_id_concern_pk" PRIMARY KEY("user_id","concern")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"category" text,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "product_source" NOT NULL,
	"source_url" text,
	"image_id" uuid,
	"slot" "routine_slot" DEFAULT 'none' NOT NULL,
	"on_shelf" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_scores" (
	"scan_id" uuid NOT NULL,
	"concern" text NOT NULL,
	"ui_score" integer,
	"raw_score" real,
	"mask_image_id" uuid,
	CONSTRAINT "scan_scores_scan_id_concern_pk" PRIMARY KEY("scan_id","concern")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"mode" "scan_mode" NOT NULL,
	"status" "scan_status" DEFAULT 'pending' NOT NULL,
	"context" "scan_context" DEFAULT 'routine' NOT NULL,
	"is_calibration" boolean DEFAULT false NOT NULL,
	"youcam_file_id" text,
	"youcam_task_id" text,
	"error_code" text,
	"overall_score" real,
	"skin_age" integer,
	"quality" jsonb,
	"raw_result" jsonb,
	"units" integer,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"target_concerns" jsonb NOT NULL,
	"baseline_scan_ids" jsonb NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "trial_status" DEFAULT 'active' NOT NULL,
	"verdict" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verified_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"trial_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"body" text NOT NULL,
	"deltas" jsonb NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noise_profiles" ADD CONSTRAINT "noise_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_scores" ADD CONSTRAINT "scan_scores_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_scores" ADD CONSTRAINT "scan_scores_mask_image_id_images_id_fk" FOREIGN KEY ("mask_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_reviews" ADD CONSTRAINT "verified_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_reviews" ADD CONSTRAINT "verified_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_reviews" ADD CONSTRAINT "verified_reviews_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_user_created_idx" ON "chat_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "diary_user_day_idx" ON "diary_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "products_user_idx" ON "products" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scans_user_created_idx" ON "scans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "trials_user_status_idx" ON "trials" USING btree ("user_id","status");