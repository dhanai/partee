import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GamePlayerRow } from "../../lib/games-api";
import type { SkinsTieHandling } from "../../lib/skins-scoring";
import { colors } from "../../lib/theme";

export type SkinsPayload = {
  result: "won" | "tie";
  winnerUserIds: string[];
};

/** API may still return legacy `carry` until re-saved. */
export type SkinsHoleInitial = SkinsPayload | { result: "carry"; winnerUserIds?: string[] };

type Props = {
  holeNumber: number;
  players: GamePlayerRow[];
  initial?: SkinsHoleInitial | null;
  /** Carry = tied hole adds to next pot; wash = tie clears carry. */
  tieHandling?: SkinsTieHandling;
  onSave: (payload: SkinsPayload) => void;
  onCancel: () => void;
};

function displayName(p: GamePlayerRow) {
  return p.isGuest ? `${p.name} (guest)` : p.name;
}

function initialLowPicks(initial: SkinsHoleInitial | null | undefined): Set<string> {
  if (!initial) return new Set();
  const r = initial.result === "carry" ? "tie" : initial.result;
  const ids = initial.winnerUserIds ?? [];
  if (r === "won" && ids.length === 1) return new Set(ids);
  if (r === "tie" && ids.length >= 2) return new Set(ids);
  return new Set();
}

export function SkinsHoleEditor({
  holeNumber,
  players,
  initial,
  tieHandling = "carry",
  onSave,
  onCancel,
}: Props) {
  const [lowPick, setLowPick] = useState<Set<string>>(() => initialLowPicks(initial));

  /** One row per golfer (avoids duplicate keys / toggling the same id twice). */
  const roster = useMemo(() => {
    const m = new Map<string, GamePlayerRow>();
    for (const p of players) {
      if (!m.has(p.userId)) m.set(p.userId, p);
    }
    return [...m.values()];
  }, [players]);

  const n = lowPick.size;
  const soleLow = n === 1;
  const tiedLow = n >= 2;

  const summaryLine = useMemo(() => {
    if (n === 0) return "Tap everyone who had the lowest score on this hole.";
    if (soleLow) return "Sole low — this player takes the skin (and any carried skins).";
    return tieHandling === "wash"
      ? "Tied for low — pot washes; next hole is a single skin again."
      : "Tied for low — the skin carries to the next hole (pot grows).";
  }, [n, soleLow, tieHandling]);

  function toggle(id: string) {
    setLowPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const save = useCallback(() => {
    if (n === 0) return;
    const ids = [...lowPick];
    if (ids.length === 1) {
      onSave({ result: "won", winnerUserIds: [ids[0]!] });
      return;
    }
    onSave({ result: "tie", winnerUserIds: ids });
  }, [n, lowPick, onSave]);

  const saveEnabled = n >= 1;

  return (
    <View style={styles.wrap}>
      <View style={styles.editorHero}>
        <View style={styles.editorHeroTop}>
          <View style={styles.editorHeroTitles}>
            <Text style={styles.editorHeroEyebrow}>Skins · Results</Text>
            <Text style={styles.editorHeroTitle}>Hole {holeNumber}</Text>
          </View>
          <View style={styles.editorHeroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>Low gross</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Who shot the lowest?</Text>
      <Text style={styles.sectionSub}>Tap one winner, or tap everyone who tied for low.</Text>

      {roster.map((p) => {
        const on = lowPick.has(p.userId);
        return (
          <Pressable
            key={p.userId}
            style={[styles.choiceCard, on && styles.choiceCardOn]}
            onPress={() => toggle(p.userId)}
          >
            <View style={styles.winnerRowInner}>
              <Text style={styles.choiceCardText}>{displayName(p)}</Text>
              {on ? (
                <Text style={styles.winnerBadge}>{tiedLow ? "Tied low" : "Low"}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      <View style={[styles.pointsCard, n === 0 && styles.pointsCardPending]}>
        <View style={styles.pointsCardHead}>
          <Ionicons
            name={n === 0 ? "hourglass-outline" : "trophy-outline"}
            size={18}
            color={n === 0 ? colors.muted : colors.fairway}
          />
          <Text style={styles.pointsLabel}>Skin</Text>
        </View>
        <Text style={[styles.pointsBody, n === 0 && styles.pointsBodyPending]}>{summaryLine}</Text>
      </View>

      <View style={styles.stepFooter}>
        <Pressable style={styles.footerGhost} onPress={onCancel}>
          <Text style={styles.footerGhostText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.footerPrimary, !saveEnabled && styles.footerPrimaryOff]}
          onPress={() => save()}
          disabled={!saveEnabled}
        >
          <Text style={styles.footerPrimaryText}>Save hole</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingBottom: 28 },
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
  editorHeroPills: { alignItems: "flex-end", gap: 6 },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroPillText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  sectionLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginTop: 4,
  },
  sectionSub: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4, marginBottom: 2 },
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.fairwaySoft,
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
