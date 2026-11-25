ALTER TABLE "categories" ADD COLUMN "station" text DEFAULT 'bar' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_charge_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "service_charge_rate" integer DEFAULT 0 NOT NULL;