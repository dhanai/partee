CREATE TYPE "public"."planning_time_window" AS ENUM('morning', 'afternoon', 'twilight');--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "preferred_time_window" "planning_time_window";
