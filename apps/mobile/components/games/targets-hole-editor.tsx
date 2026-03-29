import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

export type TargetsPayload = { hits: Record<string, boolean> };

const CATEGORY_LABELS: Record<string, string> = {
  fairways: "Fairway hit",
  greens: "Green in regulation",
  pars: "Par or better",
  birdies: "Birdie or better",
};

function displayName(p: GamePlayerRow): string {
  const n = p.name?.trim();
  if (!n) return p.isGuest ? "Guest" : "Player";
  return p.isGuest ? `${n} (guest)` : n;
}

export function TargetsHoleEditor({
  holeNumber,
  players,
  category,
  initial,
  onCancel,
  onSave,
}: {
  holeNumber: number;
  players: GamePlayerRow[];
  category: string;
  initial: TargetsPayload | null;
  onCancel: () => void;
  onSave: (payload: TargetsPayload) => void;
}) {
  const [hits, setHits] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of players) {
      init[p.userId] = initial?.hits?.[p.userId] ?? false;
    }
    return init;
  });

  function toggle(userId: string) {
    setHits((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function handleSave() {
    onSave({ hits });
  }

  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Hole {holeNumber}</Text>
      <Text style={styles.sub}>Target: {categoryLabel}</Text>

      <View style={styles.list}>
        {players.map((p) => {
          const on = hits[p.userId] ?? false;
          return (
            <Pressable
              key={p.userId}
              style={[styles.row, on && styles.rowOn]}
              onPress={() => toggle(p.userId)}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
                <Text style={styles.playerName}>{displayName(p)}</Text>
              </View>
              <Text style={[styles.hitLabel, on && styles.hitLabelOn]}>
                {on ? "Hit" : "Miss"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 16 },
  list: { gap: 8, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#ece8e1",
    backgroundColor: "#faf8f5",
  },
  rowOn: { backgroundColor: "#edf4ef", borderColor: colors.fairway },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ece8e1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.fairway, borderColor: colors.fairway },
  playerName: { fontSize: 15, fontWeight: "600", color: colors.text },
  hitLabel: { fontSize: 13, fontWeight: "700", color: colors.muted },
  hitLabelOn: { color: colors.fairway },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#ece8e1",
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.fairway,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
