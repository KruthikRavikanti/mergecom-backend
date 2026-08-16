CREATE TYPE "public"."review_anchor_type" AS ENUM('general', 'comparison_change');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."review_request_status" AS ENUM('open', 'approved', 'changes_requested', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."review_thread_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "review_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_request_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_request_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"comparison_id" uuid,
	"requested_by_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" "review_request_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_requests_terminal_state_ck" CHECK (("review_requests"."status" = 'open' and "review_requests"."closed_at" is null and "review_requests"."closed_by_user_id" is null)
          or ("review_requests"."status" <> 'open' and "review_requests"."closed_at" is not null and "review_requests"."closed_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_request_id" uuid NOT NULL,
	"comparison_id" uuid,
	"anchor_type" "review_anchor_type" NOT NULL,
	"anchor_change_id" text,
	"anchor_path" text,
	"anchor_label" text,
	"anchor_category" text,
	"status" "review_thread_status" DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_threads_anchor_ck" CHECK (("review_threads"."anchor_type" = 'general' and "review_threads"."comparison_id" is null
            and "review_threads"."anchor_change_id" is null and "review_threads"."anchor_path" is null
            and "review_threads"."anchor_label" is null and "review_threads"."anchor_category" is null)
          or ("review_threads"."anchor_type" = 'comparison_change' and "review_threads"."comparison_id" is not null
            and "review_threads"."anchor_change_id" ~ '^[0-9a-f]{64}$' and "review_threads"."anchor_path" is not null
            and "review_threads"."anchor_label" is not null
            and "review_threads"."anchor_category" in ('content', 'feature', 'structure', 'validation'))),
	CONSTRAINT "review_threads_resolution_ck" CHECK (("review_threads"."status" = 'open' and "review_threads"."resolved_at" is null and "review_threads"."resolved_by_user_id" is null)
          or ("review_threads"."status" = 'resolved' and "review_threads"."resolved_at" is not null and "review_threads"."resolved_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "document_branches" ADD COLUMN "approved_version_id" uuid;--> statement-breakpoint
ALTER TABLE "document_branches" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_branches" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_review_request_id_review_requests_id_fk" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_thread_id_review_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."review_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_review_request_id_review_requests_id_fk" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_comparison_id_version_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."version_comparisons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_review_request_id_review_requests_id_fk" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_comparison_id_version_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."version_comparisons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignments_request_reviewer_uq" ON "review_assignments" USING btree ("review_request_id","reviewer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignments_organization_request_reviewer_uq" ON "review_assignments" USING btree ("organization_id","review_request_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_assignments_reviewer_idx" ON "review_assignments" USING btree ("organization_id","reviewer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "review_comments_thread_created_idx" ON "review_comments" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_decisions_request_reviewer_uq" ON "review_decisions" USING btree ("review_request_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_decisions_version_created_idx" ON "review_decisions" USING btree ("organization_id","version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_open_version_uq" ON "review_requests" USING btree ("version_id") WHERE "review_requests"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_organization_id_version_uq" ON "review_requests" USING btree ("organization_id","id","version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_organization_id_uq" ON "review_requests" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "review_requests_document_created_idx" ON "review_requests" USING btree ("organization_id","document_id","created_at","id");--> statement-breakpoint
CREATE INDEX "review_requests_version_idx" ON "review_requests" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "review_threads_request_created_idx" ON "review_threads" USING btree ("review_request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_threads_organization_id_uq" ON "review_threads" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "review_threads_anchor_idx" ON "review_threads" USING btree ("comparison_id","anchor_change_id");--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "version_comparisons_organization_document_id_uq" ON "version_comparisons" USING btree ("organization_id","document_id","id");--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_approval_pointer_ck" CHECK (("document_branches"."approved_version_id" is null and "document_branches"."approved_at" is null and "document_branches"."approved_by_user_id" is null)
          or ("document_branches"."approved_version_id" is not null and "document_branches"."approved_at" is not null and "document_branches"."approved_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "document_branches" ADD CONSTRAINT "document_branches_organization_approved_fk"
FOREIGN KEY ("organization_id", "document_id", "approved_version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_version_fk"
FOREIGN KEY ("organization_id", "document_id", "version_id")
REFERENCES "public"."document_versions"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_comparison_fk"
FOREIGN KEY ("organization_id", "document_id", "comparison_id")
REFERENCES "public"."version_comparisons"("organization_id", "document_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_organization_request_fk"
FOREIGN KEY ("organization_id", "review_request_id")
REFERENCES "public"."review_requests"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_organization_request_version_fk"
FOREIGN KEY ("organization_id", "review_request_id", "version_id")
REFERENCES "public"."review_requests"("organization_id", "id", "version_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_assignment_fk"
FOREIGN KEY ("organization_id", "review_request_id", "reviewer_user_id")
REFERENCES "public"."review_assignments"("organization_id", "review_request_id", "reviewer_user_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_organization_request_fk"
FOREIGN KEY ("organization_id", "review_request_id")
REFERENCES "public"."review_requests"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_organization_thread_fk"
FOREIGN KEY ("organization_id", "thread_id")
REFERENCES "public"."review_threads"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
CREATE FUNCTION enforce_review_request_comparison() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.comparison_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM version_comparisons comparison
    WHERE comparison.id = NEW.comparison_id
      AND comparison.organization_id = NEW.organization_id
      AND comparison.document_id = NEW.document_id
      AND comparison.target_version_id = NEW.version_id
      AND comparison.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'review comparison must be a completed comparison targeting the reviewed version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER review_requests_comparison_guard
BEFORE INSERT OR UPDATE OF organization_id, document_id, version_id, comparison_id
ON review_requests FOR EACH ROW EXECUTE FUNCTION enforce_review_request_comparison();--> statement-breakpoint
CREATE FUNCTION enforce_review_thread_anchor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request_comparison_id uuid;
  request_version_id uuid;
  persisted_change jsonb;
BEGIN
  SELECT comparison_id, version_id
    INTO request_comparison_id, request_version_id
    FROM review_requests
   WHERE id = NEW.review_request_id AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review request not found for thread anchor' USING ERRCODE = '23503';
  END IF;

  IF NEW.anchor_type = 'comparison_change' THEN
    IF request_comparison_id IS DISTINCT FROM NEW.comparison_id THEN
      RAISE EXCEPTION 'thread comparison must match the review comparison' USING ERRCODE = '23514';
    END IF;

    SELECT change
      INTO persisted_change
      FROM version_comparisons comparison,
           jsonb_array_elements(comparison.changes) change
     WHERE comparison.id = NEW.comparison_id
       AND comparison.organization_id = NEW.organization_id
       AND comparison.target_version_id = request_version_id
       AND comparison.status = 'completed'
       AND change->>'id' = NEW.anchor_change_id;

    IF persisted_change IS NULL
       OR persisted_change->>'path' IS DISTINCT FROM NEW.anchor_path
       OR persisted_change->>'label' IS DISTINCT FROM NEW.anchor_label
       OR persisted_change->>'category' IS DISTINCT FROM NEW.anchor_category THEN
      RAISE EXCEPTION 'thread anchor does not match a persisted comparison change'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER review_threads_anchor_guard
BEFORE INSERT OR UPDATE OF organization_id, review_request_id, comparison_id,
  anchor_type, anchor_change_id, anchor_path, anchor_label, anchor_category
ON review_threads FOR EACH ROW EXECUTE FUNCTION enforce_review_thread_anchor();--> statement-breakpoint
CREATE FUNCTION prevent_review_record_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER review_decisions_append_only
BEFORE UPDATE OR DELETE ON review_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_review_record_mutation();--> statement-breakpoint
CREATE TRIGGER review_comments_append_only
BEFORE UPDATE OR DELETE ON review_comments
FOR EACH ROW EXECUTE FUNCTION prevent_review_record_mutation();
