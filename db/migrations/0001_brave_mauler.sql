ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");