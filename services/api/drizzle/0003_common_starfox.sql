CREATE TYPE "public"."artifact_scan_status" AS ENUM('pending', 'clean', 'quarantined', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('queued', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."staged_upload_status" AS ENUM('pending', 'finalized', 'cancelled', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_mode" AS ENUM('single', 'multipart');--> statement-breakpoint
CREATE TYPE "public"."version_source" AS ENUM('web_upload', 'office_addin', 'restore', 'merge', 'import');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('pending_processing', 'ready', 'conflicted', 'quarantined', 'failed');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"detected_media_type" text NOT NULL,
	"original_filename" text NOT NULL,
	"extension" text NOT NULL,
	"storage_version" text,
	"storage_checksum" text,
	"scan_status" "artifact_scan_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_byte_size_ck" CHECK ("artifacts"."byte_size" > 0),
	CONSTRAINT "artifacts_sha256_ck" CHECK ("artifacts"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "document_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"head_version_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"display_number" integer NOT NULL,
	"parent_version_id" uuid,
	"merge_parent_version_id" uuid,
	"base_version_id" uuid,
	"source" "version_source" NOT NULL,
	"status" "version_status" NOT NULL,
	"note" text NOT NULL,
	"conflict_reason" text,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_sequence_ck" CHECK ("document_versions"."sequence" > 0),
	CONSTRAINT "document_versions_conflict_status_ck" CHECK (("document_versions"."status" = 'conflicted' and "document_versions"."conflict_reason" is not null)
          or ("document_versions"."status" <> 'conflicted' and "document_versions"."conflict_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staged_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"base_version_id" uuid,
	"staging_object_key" text NOT NULL,
	"expected_sha256" text NOT NULL,
	"expected_byte_size" bigint NOT NULL,
	"client_media_type" text,
	"original_filename" text NOT NULL,
	"extension" text NOT NULL,
	"mode" "upload_mode" NOT NULL,
	"multipart_upload_id" text,
	"part_size" integer,
	"status" "staged_upload_status" DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"finalized_version_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staged_uploads_sha256_ck" CHECK ("staged_uploads"."expected_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "staged_uploads_byte_size_ck" CHECK ("staged_uploads"."expected_byte_size" > 0),
	CONSTRAINT "staged_uploads_multipart_ck" CHECK (("staged_uploads"."mode" = 'single' and "staged_uploads"."multipart_upload_id" is null and "staged_uploads"."part_size" is null)
          or ("staged_uploads"."mode" = 'multipart' and "staged_uploads"."multipart_upload_id" is not null and "staged_uploads"."part_size" is not null))
);
--> statement-breakpoint
CREATE TABLE "version_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"status" "processing_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_branch_id_document_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."document_branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_parent_version_id_document_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_merge_parent_version_id_document_versions_id_fk" FOREIGN KEY ("merge_parent_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_base_version_id_document_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_branch_id_document_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."document_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_base_version_id_document_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_finalized_version_id_document_versions_id_fk" FOREIGN KEY ("finalized_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD CONSTRAINT "version_processing_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_processing_jobs" ADD CONSTRAINT "version_processing_jobs_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_object_key_uq" ON "artifacts" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_organization_id_uq" ON "artifacts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "artifacts_organization_created_idx" ON "artifacts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_branches_document_name_uq" ON "document_branches" USING btree ("document_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "document_branches_default_uq" ON "document_branches" USING btree ("document_id") WHERE "document_branches"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "document_branches_organization_document_id_uq" ON "document_branches" USING btree ("organization_id","document_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_branch_sequence_uq" ON "document_versions" USING btree ("branch_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_organization_document_id_uq" ON "document_versions" USING btree ("organization_id","document_id","id");--> statement-breakpoint
CREATE INDEX "document_versions_document_created_idx" ON "document_versions" USING btree ("document_id","created_at","id");--> statement-breakpoint
CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staged_uploads_staging_key_uq" ON "staged_uploads" USING btree ("staging_object_key");--> statement-breakpoint
CREATE INDEX "staged_uploads_expiry_status_idx" ON "staged_uploads" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "version_processing_jobs_version_type_uq" ON "version_processing_jobs" USING btree ("version_id","job_type");--> statement-breakpoint
CREATE INDEX "version_processing_jobs_queue_idx" ON "version_processing_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_organization_id_uq" ON "documents" USING btree ("organization_id","id");
--> statement-breakpoint
INSERT INTO "document_branches"
  ("organization_id", "document_id", "name", "is_default", "created_by_user_id")
SELECT "organization_id", "id", 'main', true, "created_by_user_id"
FROM "documents";
--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_organization_document_fk"
FOREIGN KEY ("organization_id", "document_id")
REFERENCES "public"."documents"("organization_id", "id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_branch_fk"
FOREIGN KEY ("organization_id", "document_id", "branch_id")
REFERENCES "public"."document_branches"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_artifact_fk"
FOREIGN KEY ("organization_id", "artifact_id")
REFERENCES "public"."artifacts"("organization_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_parent_fk"
FOREIGN KEY ("organization_id", "document_id", "parent_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_merge_parent_fk"
FOREIGN KEY ("organization_id", "document_id", "merge_parent_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_base_fk"
FOREIGN KEY ("organization_id", "document_id", "base_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_organization_head_fk"
FOREIGN KEY ("organization_id", "document_id", "head_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_organization_branch_fk"
FOREIGN KEY ("organization_id", "document_id", "branch_id")
REFERENCES "public"."document_branches"("organization_id", "document_id", "id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_organization_base_fk"
FOREIGN KEY ("organization_id", "document_id", "base_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "staged_uploads" ADD CONSTRAINT "staged_uploads_organization_finalized_fk"
FOREIGN KEY ("organization_id", "document_id", "finalized_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;
