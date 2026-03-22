export type WolfPayload = {
  wolfUserId: string;
  wentAlone: boolean;
  partnerUserId?: string | null;
  outcome: "wolf_won" | "pack_won" | "tie";
  /**
   * Players who had the best (lowest) stroke count on the hole (everyone who tied that score).
   * Absent on legacy holes saved before this field existed.
   */
  winnerUserIds?: string[];
};
