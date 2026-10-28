CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"code" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'percent' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"min_subtotal" bigint DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "redeem_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "points_value" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_store_code_idx" ON "vouchers" USING btree ("store_id","code");