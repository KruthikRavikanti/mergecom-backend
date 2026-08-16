CREATE TABLE "version_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"target_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"comparison_schema_version" text DEFAULT '1.0.0' NOT NULL,
	"parser_version" text DEFAULT '1.1.0' NOT NULL,
	"engine_version" text DEFAULT '1.0.0' NOT NULL,
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
	"result_object_key" text,
	"result_sha256" text,
	"stable_hash" text,
	"byte_equal" boolean,
	"semantic_equal" boolean,
	"completeness" text,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_comparisons_distinct_versions_ck" CHECK ("version_comparisons"."base_version_id" <> "version_comparisons"."target_version_id"),
	CONSTRAINT "version_comparisons_attempts_ck" CHECK ("version_comparisons"."attempts" >= 0 and "version_comparisons"."max_attempts" > 0 and "version_comparisons"."attempts" <= "version_comparisons"."max_attempts"),
	CONSTRAINT "version_comparisons_hashes_ck" CHECK (("version_comparisons"."result_sha256" is null or "version_comparisons"."result_sha256" ~ '^[0-9a-f]{64}$')
          and ("version_comparisons"."stable_hash" is null or "version_comparisons"."stable_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "version_comparisons_completeness_ck" CHECK ("version_comparisons"."completeness" is null or "version_comparisons"."completeness" in ('complete', 'partial'))
);
--> statement-breakpoint
ALTER TABLE "version_comparisons" ADD CONSTRAINT "version_comparisons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comparisons" ADD CONSTRAINT "version_comparisons_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comparisons" ADD CONSTRAINT "version_comparisons_base_version_id_document_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comparisons" ADD CONSTRAINT "version_comparisons_target_version_id_document_versions_id_fk" FOREIGN KEY ("target_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_comparisons" ADD CONSTRAINT "version_comparisons_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "version_comparisons_version_parser_uq" ON "version_comparisons" USING btree ("base_version_id","target_version_id","comparison_schema_version","parser_version");--> statement-breakpoint
CREATE UNIQUE INDEX "version_comparisons_result_object_uq" ON "version_comparisons" USING btree ("result_object_key");--> statement-breakpoint
CREATE INDEX "version_comparisons_document_created_idx" ON "version_comparisons" USING btree ("organization_id","document_id","created_at");--> statement-breakpoint
CREATE INDEX "version_comparisons_queue_idx" ON "version_comparisons" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "version_comparisons_lease_idx" ON "version_comparisons" USING btree ("status","lease_expires_at");