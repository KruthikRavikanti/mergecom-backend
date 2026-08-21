CREATE TABLE "user_document_recents" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_document_recents" ADD CONSTRAINT "user_document_recents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_document_recents" ADD CONSTRAINT "user_document_recents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_document_recents" ADD CONSTRAINT "user_document_recents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_document_recents_user_document_uq" ON "user_document_recents" USING btree ("organization_id","user_id","document_id");--> statement-breakpoint
CREATE INDEX "user_document_recents_user_opened_idx" ON "user_document_recents" USING btree ("organization_id","user_id","opened_at","document_id");