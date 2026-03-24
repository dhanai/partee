/** Full group-chat page: tab bar is hidden so the composer can sit on the bottom edge. */
export function isRoundChatPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/round\/[^/]+\/chat$/.test(pathname);
}
