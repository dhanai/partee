import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

export type EnterStrokesPayload = {
  scores: Record<string, number>;
};

type Props = {
  holeNumber: number;
  players: GamePlayerRow[];
  initial?: EnterStrokesPayload | null;
  onSave: (payload: EnterStrokesPayload) => void;
  onCancel: () => void;
};

function displayName(p: GamePlayerRow) {
  return p.isGuest ? `${p.name} (guest)` : p.name;
}

export function EnterStrokesEditor({
  holeNumber,
  players,
  initial,
  onSave,
  onCancel,
}: Props) {
  const roster = useMemo(() => {
    const m = new Map<string, GamePlayerRow>();
    for (const p of players) {
      if (!m.has(p.userId)) m.set(p.userId, p);
    }
    return [...m.values()];
  }, [players]);

  const [scores, setScores] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of roster) {
      const existing = initial?.scores?.[p.userId];
      init[p.userId] = existing != null ? String(existing) : "";
    }
    return init;
  });

  const allFilled = roster.every((p) => {
    const v = scores[p.userId]?.trim();
    return v != null && v !== "" && /^\d+$/.test(v);
  });

  const save = useCallback(() => {
    if (!allFilled) return;
    const numericScores: Record<string, number> = {};
    for (const p of roster) {
      numericScores[p.userId] = parseInt(scores[p.userId]!, 10);
    }
    onSave({ scores: numericScores });
  }, [allFilled, roster, scores, onSave]);

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Hole {holeNumber}</Text>
      <Text style={styles.sub}>Enter each player's stroke count for this hole.</Text>

      {roster.map((p) => (
        <View key={p.userId} style={styles.playerRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            {displayName(p)}
          </Text>
          <TextInput
            style={styles.scoreInput}
            value={scores[p.userId] ?? ""}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, "");
              setScores((prev) => ({ ...prev, [p.userId]: cleaned }));
            }}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="–"
            placeholderTextColor={colors.muted}
            selectTextOnFocus
          />
        </View>
      ))}

      <View style={styles.actions}>
        <Pressable
          style={[styles.saveBtn, !allFilled && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!allFilled}
        >
          <Text style={styles.saveBtnText}>
            {initial ? "Update" : "Save"}
          </Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 16 },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  scoreInput: {
    width: 56,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  actions: { marginTop: 16, gap: 10 },
  saveBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: {
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
});
