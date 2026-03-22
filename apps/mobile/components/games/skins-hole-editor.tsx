import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

export type SkinsPayload = {
  result: "won" | "tie" | "carry";
  winnerUserIds: string[];
};

type Props = {
  players: GamePlayerRow[];
  initial?: SkinsPayload | null;
  onSave: (payload: SkinsPayload) => void;
  onCancel: () => void;
};

function displayName(p: GamePlayerRow) {
  return p.isGuest ? `${p.name} (guest)` : p.name;
}

export function SkinsHoleEditor({ players, initial, onSave, onCancel }: Props) {
  const [result, setResult] = useState<SkinsPayload["result"]>(initial?.result ?? "tie");
  const [winnerId, setWinnerId] = useState<string | null>(
    initial?.winnerUserIds?.[0] ?? null,
  );

  function save() {
    if (result === "won") {
      if (!winnerId) return;
      onSave({ result: "won", winnerUserIds: [winnerId] });
    } else if (result === "tie") {
      onSave({ result: "tie", winnerUserIds: [] });
    } else {
      onSave({ result: "carry", winnerUserIds: [] });
    }
  }

  const canSave = result !== "won" || winnerId != null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Hole result</Text>
      <View style={styles.row}>
        {(
          [
            ["tie", "Tie"],
            ["carry", "Carry"],
            ["won", "Won"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.chip, result === key && styles.chipOn]}
            onPress={() => setResult(key)}
          >
            <Text style={[styles.chipText, result === key && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {result === "won" ? (
        <>
          <Text style={styles.label}>Skin winner</Text>
          {players.map((p) => (
            <Pressable
              key={p.userId}
              style={[styles.playerRow, winnerId === p.userId && styles.playerRowOn]}
              onPress={() => setWinnerId(p.userId)}
            >
              <Text style={styles.playerName}>{displayName(p)}</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={onCancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, !canSave && styles.primaryDisabled]}
          onPress={save}
          disabled={!canSave}
        >
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  chipTextOn: { color: colors.fairway },
  playerRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  playerRowOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  playerName: { fontSize: 16, fontWeight: "600", color: colors.text },
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
});
