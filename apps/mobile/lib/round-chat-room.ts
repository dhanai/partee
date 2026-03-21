/** Ably Chat room id for a round (invite token is URL-safe from our API). */
export function roundChatRoomName(inviteToken: string): string {
  const t = inviteToken.trim();
  return `round:${t}`;
}
