export type WolfPayload = {
  wolfUserId: string;
  wentAlone: boolean;
  partnerUserId?: string | null;
  outcome: "wolf_won" | "pack_won" | "tie";
  /**
   * Who had the best score or tied for low (stats). Empty = halved hole.
   * Absent on legacy holes saved before this field existed.
   */
  winnerUserIds?: string[];
};
