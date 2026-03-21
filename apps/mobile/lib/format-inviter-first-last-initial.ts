/** "Jordan Smith" → "Jordan S."; single names unchanged. Keep in sync with `lib/round-invite-push-message.ts`. */
export function formatInviterFirstLastInitial(name: string): string {
  const t = name.trim();
  if (!t) return "Someone";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Someone";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1]!;
  const initial = last.charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}
