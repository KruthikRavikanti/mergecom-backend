CREATE TABLE "product_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"route" text NOT NULL,
	"resource_type" text NOT NULL,
	"product_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_feedback_rating_ck" CHECK ("product_feedback"."rating" between 1 and 5),
	CONSTRAINT "product_feedback_reason_ck" CHECK ("product_feedback"."reason" in ('confusing', 'missing_capability', 'performance', 'incorrect_result', 'positive', 'other')),
	CONSTRAINT "product_feedback_resource_type_ck" CHECK ("product_feedback"."resource_type" in ('onboarding', 'comparison', 'office_addin', 'setup', 'workspace', 'other'))
);
--> statement-breakpoint
CREATE TABLE "sample_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"dismissed_at" timestamp with time zone,
	"tour_version" text,
	"tour_status" text,
	"tour_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_onboarding_states_tour_ck" CHECK (("user_onboarding_states"."tour_version" is null and "user_onboarding_states"."tour_status" is null and "user_onboarding_states"."tour_updated_at" is null)
          or ("user_onboarding_states"."tour_version" is not null and "user_onboarding_states"."tour_status" in ('completed', 'skipped') and "user_onboarding_states"."tour_updated_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_comparisons" ADD CONSTRAINT "sample_comparisons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_comparisons" ADD CONSTRAINT "sample_comparisons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_comparisons" ADD CONSTRAINT "sample_comparisons_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_comparisons" ADD CONSTRAINT "sample_comparisons_comparison_id_version_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."version_comparisons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_comparisons" ADD CONSTRAINT "sample_comparisons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_states" ADD CONSTRAINT "user_onboarding_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_states" ADD CONSTRAINT "user_onboarding_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_feedback_organization_created_idx" ON "product_feedback" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_comparisons_kind_uq" ON "sample_comparisons" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_comparisons_comparison_uq" ON "sample_comparisons" USING btree ("comparison_id");--> statement-breakpoint
CREATE INDEX "sample_comparisons_organization_created_idx" ON "sample_comparisons" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_onboarding_states_user_uq" ON "user_onboarding_states" USING btree ("organization_id","user_id");