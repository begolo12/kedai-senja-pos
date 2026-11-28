ALTER TABLE "users" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_note" text DEFAULT '' NOT NULL;