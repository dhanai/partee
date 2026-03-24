import type { User } from "@/db/schema";

/**
 * Comma-separated bootstrap admin emails (lowercase match).
 * These are OR-ed with DB-backed `users.isAdmin` and can be removed after bootstrapping.
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

export function isUserAdmin(user: Pick<User, "email" | "isAdmin">): boolean {
  if (user.isAdmin) return true;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return parseAdminEmailSet().has(email);
}

export function adminEmailsConfigured(): boolean {
  return parseAdminEmailSet().size > 0;
}
