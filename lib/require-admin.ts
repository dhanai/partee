import type { User } from "@/db/schema";

/**
 * Comma-separated admin emails (lowercase match). If unset or empty, no one is admin.
 * Set `PARFADE_ADMIN_EMAILS` in production (e.g. your Parfade account email).
 */
export function parseAdminEmailSet(): Set<string> {
  const raw = process.env.PARFADE_ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isUserAdmin(user: Pick<User, "email">): boolean {
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return parseAdminEmailSet().has(email);
}

export function adminEmailsConfigured(): boolean {
  return parseAdminEmailSet().size > 0;
}
