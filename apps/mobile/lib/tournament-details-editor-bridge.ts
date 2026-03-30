/**
 * Pass draft text into the tournament details editor and read commits back — same role as
 * passing `editBody` via route params for group post, without stuffing huge strings in the URL.
 */
let seed = "";
let pendingCommit: { value: string } | undefined;

export function seedTournamentDetailsEditor(initial: string) {
  seed = initial;
}

/** Call once when the editor screen mounts. */
export function takeTournamentDetailsEditorSeed(): string {
  const v = seed;
  seed = "";
  return v;
}

export function commitTournamentDetailsEditor(value: string) {
  pendingCommit = { value };
}

/** Call when returning to the parent screen (e.g. useFocusEffect). */
export function consumeTournamentDetailsEditorCommit(): { value: string } | undefined {
  const p = pendingCommit;
  pendingCommit = undefined;
  return p;
}
