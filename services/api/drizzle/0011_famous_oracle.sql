CREATE TABLE "comparison_visualizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"renderer_profile" text NOT NULL,
	"object_key" text NOT NULL,
	"artifact_sha256" text NOT NULL,
	"total_changes" integer NOT NULL,
	"mapped_changes" integer NOT NULL,
	"exact_changes" integer NOT NULL,
	"approximate_changes" integer NOT NULL,
	"unavailable_changes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparison_visualizations_hash_ck" CHECK ("comparison_visualizations"."artifact_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "comparison_visualizations_counts_ck" CHECK ("comparison_visualizations"."total_changes" >= 0
          and "comparison_visualizations"."mapped_changes" >= 0
          and "comparison_visualizations"."exact_changes" >= 0
          and "comparison_visualizations"."approximate_changes" >= 0
          and "comparison_visualizations"."unavailable_changes" >= 0
          and "comparison_visualizations"."mapped_changes" <= "comparison_visualizations"."total_changes"
          and "comparison_visualizations"."exact_changes" + "comparison_visualizations"."approximate_changes" = "comparison_visualizations"."mapped_changes"
          and "comparison_visualizations"."mapped_changes" + "comparison_visualizations"."unavailable_changes" = "comparison_visualizations"."total_changes")
);
--> statement-breakpoint
CREATE TABLE "version_rendition_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rendition_id" uuid NOT NULL,
	"status" "processing_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"lease_owner" text,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"last_error" text,
	"trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_rendition_jobs_attempts_ck" CHECK ("version_rendition_jobs"."attempts" >= 0 and "version_rendition_jobs"."max_attempts" > 0 and "version_rendition_jobs"."attempts" <= "version_rendition_jobs"."max_attempts")
);
--> statement-breakpoint
CREATE TABLE "version_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"renderer_profile" text NOT NULL,
	"renderer_version" text NOT NULL,
	"font_pack_version" text NOT NULL,
	"status" "processing_job_status" DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"rendition_sha256" text,
	"byte_count" bigint,
	"page_count" integer,
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_renditions_source_hash_ck" CHECK ("version_renditions"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "version_renditions_output_hash_ck" CHECK ("version_renditions"."rendition_sha256" is null or "version_renditions"."rendition_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "version_renditions_output_size_ck" CHECK ("version_renditions"."byte_count" is null or "version_renditions"."byte_count" > 0),
	CONSTRAINT "version_renditions_page_count_ck" CHECK ("version_renditions"."page_count" is null or "version_renditions"."page_count" > 0),
	CONSTRAINT "version_renditions_completion_ck" CHECK (("version_renditions"."status" = 'completed'
            and "version_renditions"."object_key" is not null
            and "version_renditions"."rendition_sha256" is not null
            and "version_renditions"."byte_count" is not null
            and "version_renditions"."page_count" is not null
            and "version_renditions"."completed_at" is not null)
          or ("version_renditions"."status" <> 'completed'))
);
--> statement-breakpoint
ALTER TABLE "comparison_visualizations" ADD CONSTRAINT "comparison_visualizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_visualizations" ADD CONSTRAINT "comparison_visualizations_comparison_id_version_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."version_comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_rendition_jobs" ADD CONSTRAINT "version_rendition_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_rendition_jobs" ADD CONSTRAINT "version_rendition_jobs_rendition_id_version_renditions_id_fk" FOREIGN KEY ("rendition_id") REFERENCES "public"."version_renditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_renditions" ADD CONSTRAINT "version_renditions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_renditions" ADD CONSTRAINT "version_renditions_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_renditions" ADD CONSTRAINT "version_renditions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_visualizations_profile_uq" ON "comparison_visualizations" USING btree ("comparison_id","schema_version","engine_version","renderer_profile");--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_visualizations_object_key_uq" ON "comparison_visualizations" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_visualizations_organization_comparison_id_uq" ON "comparison_visualizations" USING btree ("organization_id","comparison_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "version_rendition_jobs_rendition_uq" ON "version_rendition_jobs" USING btree ("rendition_id");--> statement-breakpoint
CREATE INDEX "version_rendition_jobs_queue_idx" ON "version_rendition_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "version_rendition_jobs_lease_idx" ON "version_rendition_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "version_renditions_source_profile_uq" ON "version_renditions" USING btree ("version_id","source_sha256","renderer_profile","renderer_version","font_pack_version");--> statement-breakpoint
CREATE UNIQUE INDEX "version_renditions_object_key_uq" ON "version_renditions" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "version_renditions_organization_version_id_uq" ON "version_renditions" USING btree ("organization_id","version_id","id");--> statement-breakpoint
CREATE INDEX "version_renditions_version_created_idx" ON "version_renditions" USING btree ("organization_id","version_id","created_at");