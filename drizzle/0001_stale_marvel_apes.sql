ALTER TABLE "order_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" text DEFAULT 'dine_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "table_label" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "options" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "qris_payload" text DEFAULT '' NOT NULL;