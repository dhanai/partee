import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
  /** From session.settings.wolfLetterOrder; empty = legacy sessions (pick wolf manually). */
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

  const stake = wolfStakeMultiplierForHole(priorHoles, holeNumber, tieHandling);

  const [wolfId, setWolfId] = useState<string | null>(
    initial?.wolfUserId ?? expectedWolf ?? players[0]?.userId ?? null,
  );
  const [wentAlone, setWentAlone] = useState(initial?.wentAlone ?? false);
  const [partnerId, setPartnerId] = useState<string | null>(
    initial?.partnerUserId ?? null,
  );
  const [outcome, setOutcome] = useState<WolfPayload["outcome"]>(
    initial?.outcome ?? "tie",
  );
  const [winnerPick, setWinnerPick] = useState<Set<string>>(() => {
    if (initial != null && Array.isArray(initial.winnerUserIds)) {
      return new Set(initial.winnerUserIds);
    }
    return new Set<string>();
  });
  const [step, setStep] = useState<"partner" | "result">(
    initial?.wolfUserId ? "result" : "partner",
  );

  const scheduledWolf = rotationMode ? expectedWolf : wolfId;
  const packPlayers = scheduledWolf
    ? players.filter((p) => p.userId !== scheduledWolf)
    : players;

  const partnerStepValid = Boolean(
    scheduledWolf &&
      (wentAlone || (partnerId != null && partnerId !== scheduledWolf)),
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

  const saveEnabled = step === "result" && partnerStepValid;

  function teamOutcomeCaption(o: WolfPayload["outcome"]) {
    if (o === "wolf_won") return "Wolf’s team gets the points";
    if (o === "pack_won") return "Pack gets the points";
    return "No team points this hole (halved or split sides)";
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Hole {holeNumber}</Text>
        <Text style={styles.heroStake}>
          This hole is worth{" "}
          <Text style={styles.heroStakeNum}>{stake}×</Text> base points
          {tieHandling === "carry" && stake > 1 ? " (carried from tie(s))" : ""}
        </Text>
      </View>

      {rotationMode ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tee order</Text>
          <Text style={styles.cardBody}>
            {teeOrder
              .map(
                (id) =>
                  `${letterLabelForUser(letterOrderUserIds, id)} · ${nameById(players, id)}`,
              )
              .join(" → ")}
          </Text>
          <Text style={styles.wolfCallout}>
            Wolf: {nameById(players, expectedWolf!)} (
            {letterLabelForUser(letterOrderUserIds, expectedWolf!)}) — tees{" "}
            {wolfTeeOff === "first" ? "first" : "last"} this hole
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Wolf (legacy game)</Text>
          {players.map((p) => (
            <Pressable
              key={p.userId}
              style={[styles.playerRow, wolfId === p.userId && styles.playerRowOn]}
              onPress={() => {
                setWolfId(p.userId);
                if (partnerId === p.userId) setPartnerId(null);
              }}
            >
              <Text style={styles.playerName}>{displayName(p)}</Text>
            </Pressable>
          ))}
        </>
      )}

      {step === "partner" ? (
        <>
          <Text style={styles.stepHint}>Step 1 of 2 — Wolf’s choice</Text>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Lone wolf</Text>
            <Switch
              value={wentAlone}
              onValueChange={setWentAlone}
              trackColor={{ true: colors.fairwaySoft, false: colors.border }}
              thumbColor={wentAlone ? colors.fairway : "#f4f3f4"}
            />
          </View>

          {!wentAlone ? (
            <>
              <Text style={styles.label}>Partner</Text>
              {packPlayers.map((p) => (
                <Pressable
                  key={p.userId}
                  style={[styles.playerRow, partnerId === p.userId && styles.playerRowOn]}
                  onPress={() => setPartnerId(p.userId)}
                >
                  <Text style={styles.playerName}>{displayName(p)}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          <Pressable
            style={[styles.nextBtn, !partnerStepValid && styles.nextBtnDisabled]}
            disabled={!partnerStepValid}
            onPress={() => setStep("result")}
          >
            <Text style={styles.nextBtnText}>Next: who won?</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.stepHint}>Step 2 of 2 — Hole result</Text>
          {!wentAlone && partnerId && scheduledWolf ? (
            <Text style={styles.summary}>
              Wolf + partner: {nameById(players, scheduledWolf)} &{" "}
              {nameById(players, partnerId)}
            </Text>
          ) : scheduledWolf ? (
            <Text style={styles.summary}>Lone wolf: {nameById(players, scheduledWolf)}</Text>
          ) : null}
          {useLegacyOutcomeOnly ? (
            <>
              <Text style={styles.label}>Outcome (legacy hole)</Text>
              <Text style={styles.mutedSmall}>
                Older saves don’t record who scored low. Pick how points apply, or re-save with
                winners after editing.
              </Text>
              <View style={styles.row}>
                {(
                  [
                    ["wolf_won", "Wolf side wins"],
                    ["pack_won", "Pack wins"],
                    ["tie", "Tie"],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[styles.chip, outcome === key && styles.chipOn]}
                    onPress={() => setOutcome(key)}
                  >
                    <Text style={[styles.chipText, outcome === key && styles.chipTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>Who had the best score?</Text>
              <Text style={styles.mutedSmall}>
                Tap everyone who tied for low — one golfer = sole winner; several = shared low.
                Halved means no one wins the hole for points.
              </Text>
              <Pressable
                style={[styles.halvedBtn, winnerPick.size === 0 && styles.halvedBtnOn]}
                onPress={() => setWinnerPick(new Set())}
              >
                <Text
                  style={[
                    styles.halvedBtnText,
                    winnerPick.size === 0 && styles.halvedBtnTextOn,
                  ]}
                >
                  Halved — no winner
                </Text>
              </Pressable>
              {players.map((p) => {
                const on = winnerPick.has(p.userId);
                return (
                  <Pressable
                    key={p.userId}
                    style={[styles.playerRow, styles.winnerRow, on && styles.playerRowOn]}
                    onPress={() => toggleWinnerPick(p.userId)}
                  >
                    <Text style={styles.playerName}>{displayName(p)}</Text>
                    {on ? (
                      <Text style={styles.pickedMark}>Low / tied</Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {derivedTeamOutcome ? (
                <View style={styles.deriveBanner}>
                  <Text style={styles.deriveLabel}>Points</Text>
                  <Text style={styles.deriveBody}>{teamOutcomeCaption(derivedTeamOutcome)}</Text>
                </View>
              ) : null}
            </>
          )}

          <Pressable style={styles.backLink} onPress={() => setStep("partner")}>
            <Text style={styles.backLinkText}>← Edit wolf choice</Text>
          </Pressable>
        </>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={onCancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, !saveEnabled && styles.primaryDisabled]}
          onPress={save}
          disabled={!saveEnabled}
        >
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { marginBottom: 4 },
  heroKicker: { fontSize: 13, fontWeight: "700", color: colors.muted, letterSpacing: 0.5 },
  heroStake: { fontSize: 15, color: colors.text, marginTop: 4 },
  heroStakeNum: { fontWeight: "800", color: colors.fairway },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  cardBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  wolfCallout: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.fairway,
    marginTop: 4,
  },
  stepHint: { fontSize: 13, fontWeight: "600", color: colors.muted },
  summary: { fontSize: 15, color: colors.text, fontWeight: "600" },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  mutedSmall: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  chipTextOn: { color: colors.fairway },
  playerRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  playerRowOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  playerName: { fontSize: 16, fontWeight: "600", color: colors.text },
  nextBtn: {
    marginTop: 8,
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  backLink: { alignSelf: "flex-start", paddingVertical: 6 },
  backLinkText: { fontSize: 14, fontWeight: "600", color: colors.fairway },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { fontSize: 16, fontWeight: "600", color: colors.text },
  primary: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: colors.fairway,
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  halvedBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  halvedBtnOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  halvedBtnText: { fontSize: 15, fontWeight: "600", color: colors.text, textAlign: "center" },
  halvedBtnTextOn: { color: colors.fairway },
  pickedMark: { fontSize: 12, fontWeight: "700", color: colors.fairway },
  deriveBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f1efea",
    borderWidth: 1,
    borderColor: colors.border,
  },
  deriveLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  deriveBody: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 4 },
});
