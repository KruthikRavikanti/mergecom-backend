CREATE TYPE "public"."document_kind" AS ENUM('presentation', 'spreadsheet', 'word_document');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('project_lead', 'contributor', 'reviewer', 'viewer');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"sort_order" integer DEFAULT 1000 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"status_code" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 1000 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_folders_not_self_parent_ck" CHECK ("project_folders"."parent_folder_id" is null or "project_folders"."parent_folder_id" <> "project_folders"."id")
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"organization_membership_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_name" text,
	"created_by_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_membership_id_memberships_id_fk" FOREIGN KEY ("organization_membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_folder_order_idx" ON "documents" USING btree ("organization_id","project_id","folder_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_project_id_uq" ON "documents" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_actor_operation_key_uq" ON "idempotency_records" USING btree ("actor_user_id","operation","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "project_folders_parent_order_idx" ON "project_folders" USING btree ("organization_id","project_id","parent_folder_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_folders_project_id_uq" ON "project_folders" USING btree ("organization_id","project_id","id");--> statement-breakpoint
CREATE INDEX "project_memberships_project_idx" ON "project_memberships" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_memberships_organization_membership_idx" ON "project_memberships" USING btree ("organization_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_memberships_active_uq" ON "project_memberships" USING btree ("project_id","organization_membership_id") WHERE "project_memberships"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "projects_organization_updated_idx" ON "projects" USING btree ("organization_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_name_active_uq" ON "projects" USING btree ("organization_id",lower("name")) WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_id_uq" ON "projects" USING btree ("organization_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_organization_id_uq" ON "memberships" USING btree ("organization_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_folders_active_name_uq" ON "project_folders" USING btree (
	"organization_id",
	"project_id",
	coalesce("parent_folder_id", '00000000-0000-0000-0000-000000000000'::uuid),
	lower("name")
) WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_active_name_uq" ON "documents" USING btree (
	"organization_id",
	"project_id",
	coalesce("folder_id", '00000000-0000-0000-0000-000000000000'::uuid),
	lower("name")
) WHERE "deleted_at" is null;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "public"."projects"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_membership_fk" FOREIGN KEY ("organization_id", "organization_membership_id") REFERENCES "public"."memberships"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_organization_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "public"."projects"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_parent_fk" FOREIGN KEY ("organization_id", "project_id", "parent_folder_id") REFERENCES "public"."project_folders"("organization_id", "project_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "public"."projects"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_fk" FOREIGN KEY ("organization_id", "project_id", "folder_id") REFERENCES "public"."project_folders"("organization_id", "project_id", "id") ON DELETE restrict;--> statement-breakpoint
CREATE FUNCTION prevent_project_folder_cycle() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.parent_folder_id IS NULL THEN
		RETURN NEW;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM project_folders parent
		WHERE parent.id = NEW.parent_folder_id
		  AND parent.organization_id = NEW.organization_id
		  AND parent.project_id = NEW.project_id
		  AND parent.deleted_at IS NOT NULL
	) THEN
		RAISE EXCEPTION 'folder parent is deleted' USING ERRCODE = '23514';
	END IF;

	IF EXISTS (
		WITH RECURSIVE ancestors AS (
			SELECT id, parent_folder_id
			FROM project_folders
			WHERE id = NEW.parent_folder_id
			  AND organization_id = NEW.organization_id
			  AND project_id = NEW.project_id
			UNION ALL
			SELECT parent.id, parent.parent_folder_id
			FROM project_folders parent
			JOIN ancestors child ON parent.id = child.parent_folder_id
			WHERE parent.organization_id = NEW.organization_id
			  AND parent.project_id = NEW.project_id
		)
		SELECT 1 FROM ancestors WHERE id = NEW.id
	) THEN
		RAISE EXCEPTION 'folder cycle is not allowed' USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER project_folders_prevent_cycle
BEFORE INSERT OR UPDATE OF parent_folder_id, project_id, organization_id
ON project_folders
FOR EACH ROW EXECUTE FUNCTION prevent_project_folder_cycle();
