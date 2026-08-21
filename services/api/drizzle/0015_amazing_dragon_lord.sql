CREATE TABLE "comparison_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparison_summaries_input_hash_ck" CHECK ("comparison_summaries"."input_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "organization_feature_flags" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "comparison_summaries" ADD CONSTRAINT "comparison_summaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_summaries" ADD CONSTRAINT "comparison_summaries_comparison_id_version_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."version_comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_feature_flags" ADD CONSTRAINT "organization_feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_feature_flags" ADD CONSTRAINT "organization_feature_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_summaries_input_uq" ON "comparison_summaries" USING btree ("comparison_id","schema_version","engine_version","input_hash");--> statement-breakpoint
CREATE INDEX "comparison_summaries_comparison_created_idx" ON "comparison_summaries" USING btree ("organization_id","comparison_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_feature_flags_key_uq" ON "organization_feature_flags" USING btree ("organization_id","key");