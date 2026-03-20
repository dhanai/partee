export type InviteSelectionUser = {
  id: string;
  name: string;
  avatar: string | null;
};

const inviteSelections = new Map<string, InviteSelectionUser[]>();

export function getInviteSelection(flowKey: string): InviteSelectionUser[] {
  return inviteSelections.get(flowKey) ?? [];
}

export function setInviteSelection(flowKey: string, users: InviteSelectionUser[]) {
  inviteSelections.set(flowKey, users);
}

export function clearInviteSelection(flowKey: string) {
  inviteSelections.delete(flowKey);
}
