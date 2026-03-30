export type TextSelection = { start: number; end: number };

export function applyWrap(
  text: string,
  sel: TextSelection,
  before: string,
  after: string,
): { next: string; selection: TextSelection } {
  const { start, end } = sel;
  const selected = text.slice(start, end);
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  const caret = start + before.length + selected.length + after.length;
  return { next, selection: { start: caret, end: caret } };
}

export function insertSnippet(
  text: string,
  sel: TextSelection,
  snippet: string,
): { next: string; selection: TextSelection } {
  const { start, end } = sel;
  const next = text.slice(0, start) + snippet + text.slice(end);
  const caret = start + snippet.length;
  return { next, selection: { start: caret, end: caret } };
}
