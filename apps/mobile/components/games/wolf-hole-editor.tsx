import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

export type WolfPayload = {
  wolfUserId: string;
  wentAlone: boolean;
  partnerUserId?: string | null;
  outcome: "wolf_won" | "pack_won" | "tie";
};

type Props = {
  players: GamePlayerRow[];
  initial?: WolfPayload | null;
  onSave: (payload: WolfPayload) => void;
  onCancel: () => void;
};

export function WolfHoleEditor({ players, initial, onSave, onCancel }: Props) {
  const [wolfId, setWolfId] = useState<string | null>(initial?.wolfUserId ?? players[0]?.userId ?? null);
  const [wentAlone, setWentAlone] = useState(initial?.wentAlone ?? false);
  const [partnerId, setPartnerId] = useState<string | null>(
    initial?.partnerUserId ?? null,
  );
  const [outcome, setOutcome] = useState<WolfPayload["outcome"]>(
    initial?.outcome ?? "tie",
  );

  function save() {
    if (!wolfId) return;
    onSave({
      wolfUserId: wolfId,
      wentAlone,
      partnerUserId: wentAlone ? null : partnerId,
      outcome,
    });
  }

  const packPlayers = players.filter((p) => p.userId !== wolfId);
  const canSave =
    wolfId != null && (wentAlone || (partnerId != null && partnerId !== wolfId));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Wolf</Text>
      {players.map((p) => (
        <Pressable
          key={p.userId}
          style={[styles.playerRow, wolfId === p.userId && styles.playerRowOn]}
          onPress={() => {
            setWolfId(p.userId);
            if (partnerId === p.userId) setPartnerId(null);
          }}
        >
          <Text style={styles.playerName}>{p.name}</Text>
        </Pressable>
      ))}

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
              <Text style={styles.playerName}>{p.name}</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.label}>Hole outcome</Text>
      <View style={styles.row}>
        {(
          [
            ["wolf_won", "Wolf wins"],
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
