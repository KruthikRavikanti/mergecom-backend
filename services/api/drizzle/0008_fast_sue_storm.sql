CREATE TYPE "public"."notification_category" AS ENUM('review_activity', 'document_activity');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_job_status" AS ENUM('queued', 'running', 'retryable_failed', 'permanently_failed', 'completed', 'suppressed');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_job_status" DEFAULT 'queued' NOT NULL,
	"recipient_address" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"lease_owner" text,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"last_error" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_attempts_ck" CHECK ("notification_deliveries"."attempts" >= 0 and "notification_deliveries"."max_attempts" > 0 and "notification_deliveries"."attempts" <= "notification_deliveries"."max_attempts"),
	CONSTRAINT "notification_deliveries_address_ck" CHECK (("notification_deliveries"."channel" = 'email' and ("notification_deliveries"."recipient_address" is not null or "notification_deliveries"."status" = 'suppressed'))
          or ("notification_deliveries"."channel" = 'in_app' and "notification_deliveries"."recipient_address" is null)),
	CONSTRAINT "notification_deliveries_terminal_ck" CHECK (("notification_deliveries"."status" in ('completed', 'suppressed', 'permanently_failed') and "notification_deliveries"."completed_at" is not null)
          or ("notification_deliveries"."status" not in ('completed', 'suppressed', 'permanently_failed') and "notification_deliveries"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "notification_dispatches" (
	"outbox_event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "notification_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"lease_owner" text,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"last_error" text,
	"trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dispatches_attempts_ck" CHECK ("notification_dispatches"."attempts" >= 0 and "notification_dispatches"."max_attempts" > 0 and "notification_dispatches"."attempts" <= "notification_dispatches"."max_attempts"),
	CONSTRAINT "notification_dispatches_terminal_ck" CHECK (("notification_dispatches"."status" in ('completed', 'permanently_failed') and "notification_dispatches"."completed_at" is not null)
          or ("notification_dispatches"."status" not in ('completed', 'permanently_failed') and "notification_dispatches"."completed_at" is null)),
	CONSTRAINT "notification_dispatches_status_ck" CHECK ("notification_dispatches"."status" <> 'suppressed')
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"in_app_review_activity" boolean DEFAULT true NOT NULL,
	"email_review_activity" boolean DEFAULT false NOT NULL,
	"in_app_document_activity" boolean DEFAULT true NOT NULL,
	"email_document_activity" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"source_event_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notifications_content_ck" CHECK (length("user_notifications"."title") between 1 and 160
          and length("user_notifications"."body") between 1 and 500
          and "user_notifications"."href" like '/app/projects/%')
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_user_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."user_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_source_event_id_outbox_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_notification_channel_uq" ON "notification_deliveries" USING btree ("notification_id","channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queue_idx" ON "notification_deliveries" USING btree ("channel","status","available_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_lease_idx" ON "notification_deliveries" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "notification_dispatches_queue_idx" ON "notification_dispatches" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "notification_dispatches_lease_idx" ON "notification_dispatches" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_organization_user_uq" ON "notification_preferences" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_event_recipient_uq" ON "user_notifications" USING btree ("source_event_id","recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_organization_id_uq" ON "user_notifications" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "user_notifications_inbox_idx" ON "user_notifications" USING btree ("organization_id","recipient_user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_organization_id_uq" ON "outbox_events" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_membership_fk"
FOREIGN KEY ("organization_id", "user_id")
REFERENCES "public"."memberships"("organization_id", "user_id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_organization_event_fk"
FOREIGN KEY ("organization_id", "outbox_event_id")
REFERENCES "public"."outbox_events"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_membership_fk"
FOREIGN KEY ("organization_id", "recipient_user_id")
REFERENCES "public"."memberships"("organization_id", "user_id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_event_fk"
FOREIGN KEY ("organization_id", "source_event_id")
REFERENCES "public"."outbox_events"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_notification_fk"
FOREIGN KEY ("organization_id", "notification_id")
REFERENCES "public"."user_notifications"("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_lease_ck"
CHECK (("status" = 'running' and "lease_owner" is not null and "lease_expires_at" is not null and "heartbeat_at" is not null)
  or ("status" <> 'running' and "lease_owner" is null and "lease_expires_at" is null and "heartbeat_at" is null));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_lease_ck"
CHECK (("status" = 'running' and "lease_owner" is not null and "lease_expires_at" is not null and "heartbeat_at" is not null)
  or ("status" <> 'running' and "lease_owner" is null and "lease_expires_at" is null and "heartbeat_at" is null));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_provider_ck"
CHECK ("provider_message_id" is null or ("channel" = 'email' and "status" = 'completed'));
