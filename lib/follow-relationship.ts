/** Values stored on `user_follows.status`. */
export type FollowEdgeStatus = "requested" | "accepted";

export type ViewerToUserRelationship =
  | "self"
  | "none"
  | "requested_by_viewer"
  | "requested_to_viewer"
  | "following"
  | "followed_by"
  | "mutual";

/**
 * Relationship from authenticated viewer to `targetUserId`, given follow row statuses.
 */
export function relationshipViewerToUser(input: {
  viewerId: string;
  targetUserId: string;
  outgoingStatus: FollowEdgeStatus | null;
  incomingStatus: FollowEdgeStatus | null;
}): ViewerToUserRelationship {
  if (input.viewerId === input.targetUserId) return "self";
  if (input.outgoingStatus === "accepted" && input.incomingStatus === "accepted") {
    return "mutual";
  }
  if (input.outgoingStatus === "accepted") return "following";
  if (input.incomingStatus === "accepted") return "followed_by";
  if (input.outgoingStatus === "requested") return "requested_by_viewer";
  if (input.incomingStatus === "requested") return "requested_to_viewer";
  return "none";
}
