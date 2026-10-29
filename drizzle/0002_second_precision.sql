ALTER TABLE "movies" ALTER COLUMN "created_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "movies" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "movies" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "movies" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "revoked_tokens" ALTER COLUMN "expires_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "created_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_login_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (0) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();