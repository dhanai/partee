import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

export type DotsPayload = { dots: Record<string, string[]> };

const DEFAULT_ACHIEVEMENTS = [
  { key: "birdie", label: "Birdie", value: 1 },
  { key: "eagle", label: "Eagle", value: 2 },
  { key: "greenie", label: "Greenie", value: 1 },
  { key: "sandy", label: "Sandy", value: 1 },
  { key: "chipin", label: "Chip-in", value: 2 },
  { key: "oneputt", label: "One-putt", value: 1 },
  { key: "threeputt", label: "Three-putt", value: -1 },
  { key: "ob", label: "OB / Lost", value: -1 },
  { key: "double", label: "Double+", value: -1 },
];

function displayName(p: GamePlayerRow): string {
  const n = p.name?.trim();
  if (!n) return p.isGuest ? "Guest" : "Player";
  return p.isGuest ? `${n} (guest)` : n;
}

export function DotsHoleEditor({
  holeNumber,
  players,
  initial,
  onCancel,
  onSave,
}: {
  holeNumber: number;
  players: GamePlayerRow[];
  initial: DotsPayload | null;
  onCancel: () => void;
  onSave: (payload: DotsPayload) => void;
}) {
  const [dots, setDots] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const p of players) {
      const existing = initial?.dots?.[p.userId];
      init[p.userId] = new Set(Array.isArray(existing) ? existing : []);
    }
    return init;
  });

  function toggleDot(userId: string, key: string) {
    setDots((prev) => {
      const copy = { ...prev };
      const set = new Set(copy[userId] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      copy[userId] = set;
      return copy;
    });
  }

  function handleSave() {
    const payload: Record<string, string[]> = {};
    for (const p of players) {
      payload[p.userId] = [...(dots[p.userId] ?? [])];
    }
    onSave({ dots: payload });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Hole {holeNumber} — Dots</Text>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {players.map((p) => {
          const playerDots = dots[p.userId] ?? new Set();
          return (
            <View key={p.userId} style={styles.playerBlock}>
              <Text style={styles.playerName}>{displayName(p)}</Text>
              <View style={styles.chipGrid}>
                {DEFAULT_ACHIEVEMENTS.map((a) => {
                  const on = playerDots.has(a.key);
                  return (
                    <Pressable
                      key={a.key}
                      style={[
                        styles.chip,
                        on && (a.value > 0 ? styles.chipOnPositive : styles.chipOnNegative),
                      ]}
                      onPress={() => toggleDot(p.userId, a.key)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          on && styles.chipTextOn,
                        ]}
                      >
                        {a.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

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
  heading: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 },
  scroll: { flex: 1 },
  playerBlock: { marginBottom: 16 },
  playerName: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 8 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ece8e1",
    backgroundColor: "#faf8f5",
  },
  chipOnPositive: { backgroundColor: "#edf4ef", borderColor: colors.fairway },
  chipOnNegative: { backgroundColor: "#fef2f2", borderColor: "#ef4444" },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  chipTextOn: { color: colors.text },
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
