export type ProfileGameOtherName = { name: string; isGuest?: boolean };

function displayName(o: ProfileGameOtherName): string {
  return o.isGuest ? `${o.name} (guest)` : o.name;
}

/** "Sam", "Sam and Alex", or "Sam, Alex, and N others" for longer lists. */
export function formatGameWithOthersList(others: ProfileGameOtherName[]): string {
  const names = others.map(displayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]}, and ${rest} other${rest === 1 ? "" : "s"}`;
}

export function buildProfileGameFinishedHeadline(
  subjectName: string,
  gameTitle: string,
  others: ProfileGameOtherName[],
): string {
  const list = formatGameWithOthersList(others);
  const suffix = list.length > 0 ? ` with ${list}` : "";
  return `${subjectName} just finished a game of ${gameTitle}${suffix}.`;
}
