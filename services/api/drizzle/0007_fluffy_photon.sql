CREATE TYPE "public"."merge_operation_status" AS ENUM('queued', 'running', 'retryable_failed', 'permanently_failed', 'manual_resolution_required', 'completed');--> statement-breakpoint
CREATE TABLE "merge_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"ours_version_id" uuid NOT NULL,
	"theirs_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"merge_schema_version" text DEFAULT '1.0.0' NOT NULL,
	"parser_version" text DEFAULT '1.1.0' NOT NULL,
	"engine_version" text DEFAULT '1.0.0' NOT NULL,
	"status" "merge_operation_status" DEFAULT 'queued' NOT NULL,
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
	"strategy" text,
	"stable_hash" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidate_object_key" text,
	"candidate_sha256" text,
	"candidate_byte_size" bigint,
	"result_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_operations_distinct_versions_ck" CHECK ("merge_operations"."base_version_id" <> "merge_operations"."ours_version_id"
          and "merge_operations"."base_version_id" <> "merge_operations"."theirs_version_id"
          and "merge_operations"."ours_version_id" <> "merge_operations"."theirs_version_id"),
	CONSTRAINT "merge_operations_attempts_ck" CHECK ("merge_operations"."attempts" >= 0 and "merge_operations"."max_attempts" > 0 and "merge_operations"."attempts" <= "merge_operations"."max_attempts"),
	CONSTRAINT "merge_operations_hashes_ck" CHECK (("merge_operations"."stable_hash" is null or "merge_operations"."stable_hash" ~ '^[0-9a-f]{64}$')
          and ("merge_operations"."candidate_sha256" is null or "merge_operations"."candidate_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "merge_operations_candidate_ck" CHECK (("merge_operations"."candidate_object_key" is null and "merge_operations"."candidate_sha256" is null and "merge_operations"."candidate_byte_size" is null)
          or ("merge_operations"."candidate_object_key" is not null and "merge_operations"."candidate_sha256" is not null and "merge_operations"."candidate_byte_size" > 0)),
	CONSTRAINT "merge_operations_outcome_ck" CHECK (("merge_operations"."status" = 'completed' and "merge_operations"."result_version_id" is not null
            and "merge_operations"."candidate_object_key" is not null and "merge_operations"."failure_code" is null)
          or ("merge_operations"."status" = 'manual_resolution_required' and "merge_operations"."result_version_id" is null
            and "merge_operations"."failure_code" is not null)
          or ("merge_operations"."status" not in ('completed', 'manual_resolution_required')
            and "merge_operations"."result_version_id" is null))
);
--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_branch_id_document_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."document_branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_base_version_id_document_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_ours_version_id_document_versions_id_fk" FOREIGN KEY ("ours_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_theirs_version_id_document_versions_id_fk" FOREIGN KEY ("theirs_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_result_version_id_document_versions_id_fk" FOREIGN KEY ("result_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_branch_fk"
FOREIGN KEY ("organization_id", "document_id", "branch_id")
REFERENCES "public"."document_branches"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_base_fk"
FOREIGN KEY ("organization_id", "document_id", "base_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_ours_fk"
FOREIGN KEY ("organization_id", "document_id", "ours_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_theirs_fk"
FOREIGN KEY ("organization_id", "document_id", "theirs_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_organization_result_fk"
FOREIGN KEY ("organization_id", "document_id", "result_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_candidate_scope_ck"
CHECK ("candidate_object_key" is null or "candidate_object_key" like
  'organizations/' || "organization_id"::text || '/merge-candidates/%');--> statement-breakpoint
CREATE UNIQUE INDEX "merge_operations_source_versions_uq" ON "merge_operations" USING btree ("base_version_id","ours_version_id","theirs_version_id","merge_schema_version","parser_version");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_operations_candidate_object_uq" ON "merge_operations" USING btree ("candidate_object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_operations_result_version_uq" ON "merge_operations" USING btree ("result_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_operations_organization_document_id_uq" ON "merge_operations" USING btree ("organization_id","document_id","id");--> statement-breakpoint
CREATE INDEX "merge_operations_document_created_idx" ON "merge_operations" USING btree ("organization_id","document_id","created_at");--> statement-breakpoint
CREATE INDEX "merge_operations_queue_idx" ON "merge_operations" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "merge_operations_lease_idx" ON "merge_operations" USING btree ("status","lease_expires_at");
