import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SkinsHoleEditor, type SkinsPayload } from "../../../../components/games/skins-hole-editor";
import { WolfHoleEditor, type WolfPayload } from "../../../../components/games/wolf-hole-editor";
import {
  getGameSession,
  putGameHole,
  updateGameSessionStatus,
  type GameHoleRow,
  type GamePlayerRow,
  type GameSessionSummary,
} from "../../../../lib/games-api";
import { getGameDefinition } from "../../../../lib/games-registry";
import { colors } from "../../../../lib/theme";

export default function GameSessionScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getToken } = useAuth();
  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [holes, setHoles] = useState<GameHoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorHole, setEditorHole] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = await getToken();
      const data = await getGameSession(token, sessionId);
      setSession(data.session);
      setPlayers(data.players);
      setHoles(data.holes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [getToken, sessionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const holeMap = new Map(holes.map((h) => [h.holeNumber, h]));
  const editorPayload = editorHole != null ? holeMap.get(editorHole) : undefined;

  async function saveHole(payload: unknown) {
    if (!sessionId || editorHole == null) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const body: { payload: unknown; expectedVersion?: number } = { payload };
      if (editorPayload) {
        body.expectedVersion = editorPayload.version;
      }
      const res = await putGameHole(token, sessionId, editorHole, body);
      setHoles((prev) => {
        const rest = prev.filter((h) => h.holeNumber !== editorHole);
        return [...rest, res.hole].sort((a, b) => a.holeNumber - b.holeNumber);
      });
      setEditorHole(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("409") || msg.toLowerCase().includes("version")) {
        setError("Someone updated this hole first. Refresh and try again.");
        void load();
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function markComplete() {
    if (!sessionId) return;
    try {
      const token = await getToken();
      await updateGameSessionStatus(token, sessionId, "completed");
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  if (!sessionId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing session.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.fairway} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Not found"}</Text>
      </View>
    );
  }

  const def = getGameDefinition(session.gameType);
  const holesCount = session.holesCount;
  const holeNumbers = Array.from({ length: holesCount }, (_, i) => i + 1);

  return (
    <View style={styles.root}>
      <Text style={styles.head}>{def?.title ?? session.gameType}</Text>
      <Text style={styles.sub}>
        Tap a hole to record results · {session.status === "active" ? "Active" : session.status}
      </Text>

      {error ? <Text style={styles.banner}>{error}</Text> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.holeStrip}
      >
        {holeNumbers.map((n) => {
          const h = holeMap.get(n);
          return (
            <Pressable
              key={n}
              style={[styles.holeChip, h && styles.holeChipDone]}
              onPress={() => setEditorHole(n)}
            >
              <Text style={styles.holeChipNum}>{n}</Text>
              {h ? <Text style={styles.holeChipDot}>·</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {session.status === "active" ? (
        <Pressable style={styles.completeBtn} onPress={() => void markComplete()}>
          <Text style={styles.completeBtnText}>Mark complete</Text>
        </Pressable>
      ) : null}

      <Modal visible={editorHole != null} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setEditorHole(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Hole {editorHole}</Text>
            {saving ? (
              <ActivityIndicator color={colors.fairway} style={{ marginVertical: 20 }} />
            ) : session.gameType === "skins" ? (
              <SkinsHoleEditor
                players={players}
                initial={(editorPayload?.payload as SkinsPayload) ?? null}
                onCancel={() => setEditorHole(null)}
                onSave={(p) => void saveHole(p)}
              />
            ) : session.gameType === "wolf" ? (
              <WolfHoleEditor
                players={players}
                initial={(editorPayload?.payload as WolfPayload) ?? null}
                onCancel={() => setEditorHole(null)}
                onSave={(p) => void saveHole(p)}
              />
            ) : (
              <Text style={styles.muted}>
                Editing for {session.gameType} is not available in the app yet.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  head: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 12 },
  banner: { color: colors.danger, marginBottom: 8 },
  error: { color: colors.danger },
  muted: { fontSize: 14, color: colors.muted },
  holeStrip: { gap: 8, paddingVertical: 12, paddingRight: 16 },
  holeChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  holeChipDone: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  holeChipNum: { fontSize: 16, fontWeight: "800", color: colors.text },
  holeChipDot: { fontSize: 10, color: colors.fairway, marginTop: -4 },
  completeBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completeBtnText: { fontSize: 16, fontWeight: "700", color: colors.text },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "88%",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 12 },
});
