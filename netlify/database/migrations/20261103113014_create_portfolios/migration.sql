CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY,
	"products" jsonb DEFAULT '[]' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
