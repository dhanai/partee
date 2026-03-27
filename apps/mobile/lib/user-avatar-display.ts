/**
 * Only Parfade-hosted uploads are shown as profile photos.
 * Clerk/OAuth images may be stored in `users.avatar` from signup sync; we show initials until the user uploads.
 *
 * Covers `/api/uploads/avatar` → `uploads/avatars/...`, `/api/uploads/event-image` → `uploads/events/...`,
 * including blob URLs where path segments may appear as `%2F`.
 */
export function userAvatarCornerRadius(size: number): number {
  return Math.max(6, Math.round(size * 0.22));
}

function variantsForAvatarUrlCheck(url: string): string[] {
  const out: string[] = [url, url.toLowerCase()];
  try {
    out.push(decodeURIComponent(url));
  } catch {
    /* ignore */
  }
  out.push(url.replace(/%2f/gi, "/"));
  return out;
}

function isParfadeHostedAvatarUrl(url: string): boolean {
  for (const v of variantsForAvatarUrlCheck(url)) {
    const lower = v.toLowerCase();
    if (lower.includes("/uploads/avatars/")) return true;
    // Profile photos from event-image live under uploads/events/; path may omit "event-" in edge cases.
    if (lower.includes("/uploads/events/")) return true;
  }
  return false;
}

export function parfadeUserAvatarUrlForDisplay(
  url: string | null | undefined,
): string | null {
  if (url == null) return null;
  const t = typeof url === "string" ? url.trim() : "";
  if (!t) return null;
  if (!isParfadeHostedAvatarUrl(t)) return null;
  return t;
}
