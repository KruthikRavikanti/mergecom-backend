ALTER TABLE "invitations" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "project_role" "project_role";--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_assignment_ck"
CHECK (("project_id" is null and "project_role" is null)
    or ("project_id" is not null and "project_role" is not null));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_project_fk"
FOREIGN KEY ("organization_id", "project_id")
REFERENCES "public"."projects"("organization_id", "id") ON DELETE cascade;
