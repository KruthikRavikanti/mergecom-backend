ALTER TABLE "merge_operations" DROP CONSTRAINT "merge_operations_outcome_ck";--> statement-breakpoint
ALTER TABLE "merge_operations" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "merge_operations" ALTER COLUMN "merge_schema_version" SET DEFAULT '1.1.0';--> statement-breakpoint
ALTER TABLE "merge_operations" ALTER COLUMN "engine_version" SET DEFAULT '1.1.0';--> statement-breakpoint
UPDATE "merge_operations"
SET "analysis" = '{"schemaVersion":"1.0.0","automaticMergeEnabled":false,"automaticMergeEligible":false,"summary":{"ambiguous":0,"compatible_overlap":0,"non_overlapping":0,"true_conflict":0,"unsupported":0},"items":[],"blockers":[{"code":"legacy_analysis_unavailable","category":"unknown","path":null,"explanation":"This merge completed before persisted conflict analysis was introduced."}]}'::jsonb
WHERE "status" IN ('completed', 'manual_resolution_required');--> statement-breakpoint
ALTER TABLE "merge_operations" ADD CONSTRAINT "merge_operations_outcome_ck" CHECK (("merge_operations"."status" = 'completed' and "merge_operations"."result_version_id" is not null
            and "merge_operations"."candidate_object_key" is not null and "merge_operations"."failure_code" is null
            and "merge_operations"."analysis" is not null)
          or ("merge_operations"."status" = 'manual_resolution_required' and "merge_operations"."result_version_id" is null
            and "merge_operations"."failure_code" is not null and "merge_operations"."analysis" is not null)
          or ("merge_operations"."status" not in ('completed', 'manual_resolution_required')
            and "merge_operations"."result_version_id" is null));
