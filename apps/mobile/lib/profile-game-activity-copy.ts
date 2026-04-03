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

export type ProfileGameHeadlineSegment = { text: string; bold: boolean };

/** Renders as nested `<Text>`: bold only for person names; connector copy stays regular weight. */
export function buildProfileGameFinishedHeadlineSegments(
  subjectName: string,
  gameTitle: string,
  others: ProfileGameOtherName[],
): ProfileGameHeadlineSegment[] {
  const segments: ProfileGameHeadlineSegment[] = [
    { text: subjectName, bold: true },
    { text: " just finished a game of ", bold: false },
    { text: gameTitle, bold: false },
  ];
  if (others.length === 0) {
    segments.push({ text: ".", bold: false });
    return segments;
  }
  segments.push({ text: " with ", bold: false });
  if (others.length === 1) {
    segments.push({ text: displayName(others[0]!), bold: true });
  } else if (others.length === 2) {
    segments.push({ text: displayName(others[0]!), bold: true });
    segments.push({ text: " and ", bold: false });
    segments.push({ text: displayName(others[1]!), bold: true });
  } else {
    segments.push({ text: displayName(others[0]!), bold: true });
    segments.push({ text: ", ", bold: false });
    segments.push({ text: displayName(others[1]!), bold: true });
    const rest = others.length - 2;
    segments.push({
      text: `, and ${rest} other${rest === 1 ? "" : "s"}`,
      bold: false,
    });
  }
  segments.push({ text: ".", bold: false });
  return segments;
}

export function buildProfileGameFinishedHeadline(
  subjectName: string,
  gameTitle: string,
  others: ProfileGameOtherName[],
): string {
  return buildProfileGameFinishedHeadlineSegments(subjectName, gameTitle, others)
    .map((s) => s.text)
    .join("");
}
