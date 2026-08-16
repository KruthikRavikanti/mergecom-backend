CREATE TABLE "normalized_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"schema_version" text NOT NULL,
	"parser_version" text NOT NULL,
	"file_type" "document_kind" NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"stable_hash" text NOT NULL,
	"package_summary" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unsupported_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "normalized_snapshots_hashes_ck" CHECK ("normalized_snapshots"."snapshot_sha256" ~ '^[0-9a-f]{64}$' and "normalized_snapshots"."stable_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "normalized_snapshots_validation_count_ck" CHECK ("normalized_snapshots"."validation_error_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
UPDATE "version_processing_jobs"
SET "status" = CASE "status"
  WHEN 'processing' THEN 'running'
  WHEN 'succeeded' THEN 'completed'
  WHEN 'failed' THEN 'permanently_failed'
  ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."processing_job_status";--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('queued', 'running', 'retryable_failed', 'permanently_failed', 'quarantined', 'completed');--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."processing_job_status";--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."processing_job_status" USING "status"::"public"."processing_job_status";--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD COLUMN "trace_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "normalized_snapshots" ADD CONSTRAINT "normalized_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_snapshots" ADD CONSTRAINT "normalized_snapshots_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_snapshots_version_uq" ON "normalized_snapshots" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_snapshots_object_key_uq" ON "normalized_snapshots" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "normalized_snapshots_organization_created_idx" ON "normalized_snapshots" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "version_processing_jobs_lease_idx" ON "version_processing_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD CONSTRAINT "version_processing_jobs_attempts_ck" CHECK ("version_processing_jobs"."attempts" >= 0 and "version_processing_jobs"."max_attempts" > 0 and "version_processing_jobs"."attempts" <= "version_processing_jobs"."max_attempts");
