/**
 * Compact stack title: "Katie Marroquin" → "Katie M."
 */
export function formatProfileNavTitle(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "Profile";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initial = last.charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}
