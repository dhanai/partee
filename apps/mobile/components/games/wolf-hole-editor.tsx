import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GameHoleRow, GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";
import {
  letterLabelForUser,
  teeOrderForHole,
  wolfUserIdForHole,
  type WolfTeeOff,
} from "../../lib/wolf-rotation";
import type { WolfPayload } from "../../lib/wolf-payload";
import { deriveWolfHoleOutcome } from "../../lib/wolf-outcome";
import type { WolfTieHandling } from "../../lib/wolf-scoring";
import { wolfStakeMultiplierForHole } from "../../lib/wolf-scoring";

export type { WolfPayload };

type Props = {
  holeNumber: number;
  letterOrderUserIds: string[];
  wolfTeeOff: WolfTeeOff;
  tieHandling: WolfTieHandling;
  priorHoles: GameHoleRow[];
  players: GamePlayerRow[];
  initial?: WolfPayload | null;
  onSave: (payload: WolfPayload) => void;
  onCancel: () => void;
};

function displayName(p: GamePlayerRow) {
  return p.isGuest ? `${p.name} (guest)` : p.name;
}

function nameById(players: GamePlayerRow[], id: string) {
  const p = players.find((x) => x.userId === id);
  return p ? displayName(p) : id;
}

export function WolfHoleEditor({
  holeNumber,
  letterOrderUserIds,
  wolfTeeOff,
  tieHandling,
  priorHoles,
  players,
  initial,
  onSave,
  onCancel,
}: Props) {
  const useLegacyOutcomeOnly =
    initial != null && !Object.prototype.hasOwnProperty.call(initial, "winnerUserIds");

  const rotationMode = letterOrderUserIds.length > 0;

  const expectedWolf = useMemo(() => {
    if (!rotationMode) return null;
    return wolfUserIdForHole(letterOrderUserIds, holeNumber, wolfTeeOff);
  }, [rotationMode, letterOrderUserIds, holeNumber, wolfTeeOff]);

  const teeOrder = useMemo(() => {
    if (!rotationMode) return players.map((p) => p.userId);
    return teeOrderForHole(letterOrderUserIds, holeNumber);
  }, [rotationMode, letterOrderUserIds, holeNumber, players]);

  /** Roster rows in tee / letter order (A→D on this hole), not DB / host-pick order. */
  const playersInTeeOrder = useMemo(() => {
    return teeOrder
      .map((id) => players.find((p) => p.userId === id))
      .filter((p): p is GamePlayerRow => p != null);
  }, [teeOrder, players]);

  const stake = wolfStakeMultiplierForHole(priorHoles, holeNumber, tieHandling);

  const [wolfId, setWolfId] = useState<string | null>(
    initial?.wolfUserId ?? expectedWolf ?? players[0]?.userId ?? null,
  );
  const [wentAlone, setWentAlone] = useState(initial?.wentAlone ?? false);
  const [partnerId, setPartnerId] = useState<string | null>(initial?.partnerUserId ?? null);
  const [outcome, setOutcome] = useState<WolfPayload["outcome"]>(initial?.outcome ?? "tie");
  const [winnerPick, setWinnerPick] = useState<Set<string>>(() => {
    if (initial != null && Array.isArray(initial.winnerUserIds)) {
      return new Set(initial.winnerUserIds);
    }
    return new Set<string>();
  });

  const [step, setStep] = useState<"partner" | "result">(() => {
    if (!initial) return "partner";
    if (useLegacyOutcomeOnly) return "result";
    if (Object.prototype.hasOwnProperty.call(initial, "winnerUserIds")) return "result";
    return "partner";
  });

  const scheduledWolf = rotationMode ? expectedWolf : wolfId;
  const packPlayers = useMemo(() => {
    if (!scheduledWolf) return [];
    return teeOrder
      .filter((id) => id !== scheduledWolf)
      .map((id) => players.find((p) => p.userId === id))
      .filter((p): p is GamePlayerRow => p != null);
  }, [scheduledWolf, teeOrder, players]);

  const partnerStepValid = Boolean(
    scheduledWolf && (wentAlone || (partnerId != null && partnerId !== scheduledWolf)),
  );

  const widForDerive = rotationMode ? expectedWolf : wolfId;
  const derivedTeamOutcome = useMemo(() => {
    if (useLegacyOutcomeOnly || !widForDerive) return null;
    return deriveWolfHoleOutcome(
      [...winnerPick],
      widForDerive,
      wentAlone,
      wentAlone ? null : partnerId,
    );
  }, [useLegacyOutcomeOnly, winnerPick, widForDerive, wentAlone, partnerId]);

  function pickPartner(id: string) {
    setWentAlone(false);
    setPartnerId(id);
  }

  function pickLone() {
    setWentAlone(true);
    setPartnerId(null);
  }

  function toggleWinnerPick(id: string) {
    setWinnerPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const wid = rotationMode ? expectedWolf : wolfId;
    if (!wid) return;
    const partner = wentAlone ? null : partnerId;
    if (useLegacyOutcomeOnly) {
      onSave({
        wolfUserId: wid,
        wentAlone,
        partnerUserId: partner,
        outcome,
      });
      return;
    }
    const winners = [...winnerPick];
    onSave({
      wolfUserId: wid,
      wentAlone,
      partnerUserId: partner,
      winnerUserIds: winners,
      outcome: deriveWolfHoleOutcome(winners, wid, wentAlone, partner),
    });
  }

  const winnersPicked = useLegacyOutcomeOnly || winnerPick.size >= 1;
  const saveEnabled = step === "result" && partnerStepValid && winnersPicked;

  function teamOutcomeCaption(o: WolfPayload["outcome"]) {
    if (o === "wolf_won") return "Team Wolf wins the points";
    if (o === "pack_won") return "Team Pack wins the points";
    // outcome === "tie": no one wins wolf points (e.g. low gross split across both sides)
    return "No wolf points this hole.";
  }

  const tieForLow = winnerPick.size >= 2;
  const soleWinner = winnerPick.size === 1;

  const stepEyebrow = step === "partner" ? "Partner" : "Results";

  return (
    <View style={styles.wrap}>
      <View style={styles.editorHero}>
        <View style={styles.editorHeroTop}>
          <View style={styles.editorHeroTitles}>
            <Text style={styles.editorHeroEyebrow}>Wolf · {stepEyebrow}</Text>
            <Text style={styles.editorHeroTitle}>Hole {holeNumber}</Text>
          </View>
          <View style={styles.editorHeroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>{stake}× stake</Text>
            </View>
          </View>
        </View>
      </View>

      {step === "partner" ? (
        <>
          <View style={styles.stepBlock}>
            {!rotationMode ? (
              <>
                <Text style={styles.sectionEyebrow}>Manual</Text>
                <Text style={styles.sectionLabel}>Who’s the wolf?</Text>
                {playersInTeeOrder.map((p) => (
                  <Pressable
                    key={p.userId}
                    style={[styles.choiceCard, wolfId === p.userId && styles.choiceCardOn]}
                    onPress={() => {
                      setWolfId(p.userId);
                      if (partnerId === p.userId) setPartnerId(null);
                    }}
                  >
                    <Text style={styles.choiceCardText}>{displayName(p)}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <View style={styles.wolfContextCard}>
                <View style={styles.wolfContextRow}>
                  <View style={styles.wolfContextIcon}>
                    <Ionicons name="sparkles" size={16} color={colors.fairway} />
                  </View>
                  <View style={styles.wolfContextBody}>
                    <Text style={styles.wolfContextLabel}>This hole’s wolf</Text>
                    <Text style={styles.wolfContextName}>
                      {nameById(players, expectedWolf!)}
                      <Text style={styles.wolfLetter}>
                        {" "}
                        ({letterLabelForUser(letterOrderUserIds, expectedWolf!)})
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.partnerPrompt}>Choose a partner or go lone</Text>

          {packPlayers.map((p) => (
            <Pressable
              key={p.userId}
              style={[
                styles.choiceCard,
                !wentAlone && partnerId === p.userId && styles.choiceCardOn,
              ]}
              onPress={() => pickPartner(p.userId)}
            >
              <Text style={styles.choiceCardText}>
                {rotationMode ? (
                  <Text style={styles.teeLetterPrefix}>
                    {letterLabelForUser(letterOrderUserIds, p.userId)} ·{" "}
                  </Text>
                ) : null}
                {displayName(p)}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={[styles.loneCard, wentAlone && styles.loneCardOn]}
            onPress={pickLone}
          >
            <Text style={[styles.loneCardTitle, wentAlone && styles.loneCardTitleOn]}>
              Go lone wolf
            </Text>
          </Pressable>

          <View style={styles.stepFooter}>
            <Pressable style={styles.footerGhost} onPress={onCancel}>
              <Text style={styles.footerGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.footerPrimary, !partnerStepValid && styles.footerPrimaryOff]}
              disabled={!partnerStepValid}
              onPress={() => setStep("result")}
            >
              <Text style={styles.footerPrimaryText}>Results →</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {useLegacyOutcomeOnly ? (
            <>
              <Text style={styles.sectionEyebrow}>Legacy</Text>
              <Text style={styles.sectionLabel}>How points count (legacy hole)</Text>
              <Text style={styles.sectionSub}>
                This hole was saved before winner picks. Choose how points apply, or go back and
                re-save with winners.
              </Text>
              <View style={styles.legacyRow}>
                {(
                  [
                    ["wolf_won", "Wolf side"],
                    ["pack_won", "Opponents"],
                    ["tie", "Tie"],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[styles.legacyChip, outcome === key && styles.legacyChipOn]}
                    onPress={() => setOutcome(key)}
                  >
                    <Text style={[styles.legacyChipText, outcome === key && styles.legacyChipTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Who shot the lowest?</Text>
              {playersInTeeOrder.map((p) => {
                const on = winnerPick.has(p.userId);
                return (
                  <Pressable
                    key={p.userId}
                    style={[styles.choiceCard, on && styles.choiceCardOn]}
                    onPress={() => toggleWinnerPick(p.userId)}
                  >
                    <View style={styles.winnerRowInner}>
                      <Text style={styles.choiceCardText}>
                        {rotationMode ? (
                          <Text style={styles.teeLetterPrefix}>
                            {letterLabelForUser(letterOrderUserIds, p.userId)} ·{" "}
                          </Text>
                        ) : null}
                        {displayName(p)}
                      </Text>
                      {on ? (
                        <Text style={styles.winnerBadge}>
                          {tieForLow ? "Tied low" : "Low"}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {winnerPick.size > 0 ? (
                <Text style={styles.tieHint}>
                  {tieForLow
                    ? derivedTeamOutcome === "tie"
                      ? "Lowest score split between Team Wolf and Team Pack — no wolf points (see Points)."
                      : "Same lowest score — those players tied."
                    : soleWinner
                      ? "Only player with the lowest score on this hole."
                      : ""}
                </Text>
              ) : null}

              <View
                style={[
                  styles.pointsCard,
                  winnerPick.size === 0 && styles.pointsCardPending,
                ]}
              >
                <View style={styles.pointsCardHead}>
                  <Ionicons
                    name={winnerPick.size === 0 ? "hourglass-outline" : "trophy-outline"}
                    size={18}
                    color={winnerPick.size === 0 ? colors.muted : colors.fairway}
                  />
                  <Text style={styles.pointsLabel}>Points</Text>
                </View>
                <Text
                  style={[
                    styles.pointsBody,
                    winnerPick.size === 0 && styles.pointsBodyPending,
                  ]}
                >
                  {winnerPick.size === 0
                    ? "Pending results — tap everyone who shot the lowest."
                    : derivedTeamOutcome != null
                      ? teamOutcomeCaption(derivedTeamOutcome)
                      : ""}
                </Text>
              </View>
            </>
          )}

          <View style={styles.stepFooter}>
            <Pressable style={styles.footerGhost} onPress={() => setStep("partner")}>
              <Text style={styles.footerGhostText}>← Partner</Text>
            </Pressable>
            <Pressable
              style={[styles.footerPrimary, !saveEnabled && styles.footerPrimaryOff]}
              onPress={save}
              disabled={!saveEnabled}
            >
              <Text style={styles.footerPrimaryText}>Save hole</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  editorHero: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.fairway,
    marginBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  editorHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  editorHeroTitles: { flex: 1, minWidth: 0 },
  editorHeroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  editorHeroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.4,
  },
  partnerPrompt: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
    marginBottom: 2,
  },
  editorHeroPills: { alignItems: "flex-end", gap: 6 },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroPillText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  stepBlock: { gap: 6, marginBottom: 0 },
  wolfContextCard: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  wolfContextRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  wolfContextIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  wolfContextBody: { flex: 1, minWidth: 0 },
  wolfContextLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  wolfContextName: { fontSize: 17, fontWeight: "800", color: colors.text },
  wolfLetter: { fontWeight: "700", color: colors.muted, fontSize: 16 },
  teeLetterPrefix: { fontWeight: "800", color: colors.muted },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginTop: 2,
  },
  sectionSub: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 6 },
  choiceCard: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  choiceCardOn: {
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
    shadowOpacity: 0.08,
  },
  choiceCardText: { fontSize: 17, fontWeight: "700", color: colors.text },
  loneCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#c5d4c9",
    backgroundColor: "rgba(237, 244, 239, 0.35)",
    marginTop: 4,
  },
  loneCardOn: {
    borderStyle: "solid",
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
  },
  loneCardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  loneCardTitleOn: { color: colors.text },
  winnerRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  winnerBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.fairway,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.fairwaySoft,
  },
  tieHint: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.fairway,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  pointsCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pointsCardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  pointsLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.2,
  },
  pointsBody: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 8, lineHeight: 22 },
  pointsCardPending: {
    borderStyle: "dashed",
    backgroundColor: colors.background,
  },
  pointsBodyPending: { fontWeight: "600", color: colors.muted },
  legacyRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  legacyChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legacyChipOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  legacyChipText: { fontSize: 15, fontWeight: "700", color: colors.text },
  legacyChipTextOn: { color: colors.text },
  stepFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerGhost: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerGhostText: { fontSize: 16, fontWeight: "700", color: colors.muted },
  footerPrimary: {
    flex: 1.2,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.fairway,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  footerPrimaryOff: { opacity: 0.45 },
  footerPrimaryText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
