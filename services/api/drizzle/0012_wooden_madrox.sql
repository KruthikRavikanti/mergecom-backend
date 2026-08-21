DROP INDEX "version_renditions_object_key_uq";--> statement-breakpoint
ALTER TABLE "merge_operations" ALTER COLUMN "parser_version" SET DEFAULT '1.2.0';--> statement-breakpoint
ALTER TABLE "version_comparisons" ALTER COLUMN "parser_version" SET DEFAULT '1.2.0';--> statement-breakpoint
CREATE INDEX "version_renditions_object_key_idx" ON "version_renditions" USING btree ("object_key");