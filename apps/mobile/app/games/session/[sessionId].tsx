import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { RoundOverflowMenuSheet } from "../../../components/round-overflow-menu-sheet";
import { SkinsHoleEditor, type SkinsPayload } from "../../../components/games/skins-hole-editor";
import { WolfHoleEditor, type WolfPayload } from "../../../components/games/wolf-hole-editor";
import {
  deleteGameSession,
  getGameSession,
  putGameHole,
  updateGameSessionStatus,
  type GameHoleRow,
  type GamePlayerRow,
  type GameSessionSummary,
} from "../../../lib/games-api";
import { getGameDefinition } from "../../../lib/games-registry";
import { letterLabelForUser } from "../../../lib/wolf-rotation";
import type { WolfTeeOff } from "../../../lib/wolf-rotation";
import { computeWolfTotals, type WolfTieHandling } from "../../../lib/wolf-scoring";
import { colors } from "../../../lib/theme";

function parseWolfLetterOrder(settings: Record<string, unknown>): string[] {
  const raw = settings.wolfLetterOrder;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function normalizeRouteParam(p: string | string[] | undefined): string | undefined {
  if (p == null) return undefined;
  return Array.isArray(p) ? p[0] : p;
}

export default function GameSessionScreen() {
  const router = useRouter();
  /** Root stack (same bar as title “Game” / back to Games). Leaf `useNavigation()` targets an inner navigator for this route depth. */
  const rootNavigation = useNavigation("/");
  const { sessionId: sessionIdRaw } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = normalizeRouteParam(sessionIdRaw);
  const { getToken } = useAuth();
  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [holes, setHoles] = useState<GameHoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorHole, setEditorHole] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setSession(null);
    setPlayers([]);
    setHoles([]);
    setError(null);
    setLoading(true);
  }, [sessionId]);

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

  useLayoutEffect(() => {
    if (!sessionId || loading || !session) {
      rootNavigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: undefined,
      });
      return;
    }
    rootNavigation.setOptions({
      headerRightContainerStyle: { paddingRight: 10 },
      headerRight: () => (
        <Pressable
          accessibilityLabel="Game actions"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => setGameMenuOpen(true)}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [rootNavigation, sessionId, loading, session]);

  const holeMap = new Map(holes.map((h) => [h.holeNumber, h]));
  const editorPayload = editorHole != null ? holeMap.get(editorHole) : undefined;

  const wolfTieHandling: WolfTieHandling =
    session?.settings?.wolfTieHandling === "wash" ? "wash" : "carry";
  const wolfTotals = useMemo(() => {
    if (!session || session.gameType !== "wolf") return null;
    const ids = players.map((p) => p.userId);
    return computeWolfTotals(holes, ids, wolfTieHandling);
  }, [session, holes, players, wolfTieHandling]);

  const priorWolfHoles = useMemo(() => {
    if (editorHole == null) return [];
    return holes
      .filter((h) => h.holeNumber < editorHole)
      .sort((a, b) => a.holeNumber - b.holeNumber);
  }, [holes, editorHole]);

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
      setTimeout(() => router.replace("/games"), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  async function performDeleteGame() {
    if (!sessionId || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        const msg = "Sign in to delete this game.";
        setError(msg);
        Alert.alert("Could not delete", msg);
        return;
      }
      await deleteGameSession(token, sessionId);
      // Replace stack target so we always land on Games (back() can no-op or leave you on another tab).
      setTimeout(() => {
        router.replace("/games");
      }, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete";
      setError(msg);
      Alert.alert("Could not delete", msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  function confirmDeleteGame() {
    Alert.alert(
      "Delete game?",
      "This removes the game and all recorded holes for everyone in the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Defer past alert dismissal — otherwise iOS sometimes never runs the async work.
            setTimeout(() => void performDeleteGame(), 0);
          },
        },
      ],
    );
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
  const wolfLetterOrder =
    session.gameType === "wolf" ? parseWolfLetterOrder(session.settings) : [];
  const wolfTeeOffUi: WolfTeeOff =
    session.settings?.wolfTeeOff === "last" ? "last" : "first";

  return (
    <>
      <View style={styles.root}>
        <Text style={styles.head}>{def?.title ?? session.gameType}</Text>
        <Text style={styles.sub}>
          Tap a hole to record results · {session.status === "active" ? "Active" : session.status}
        </Text>

        {error ? <Text style={styles.banner}>{error}</Text> : null}

        {session.gameType === "wolf" && wolfTotals ? (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreTitle}>Standings</Text>
            {players
              .map((p) => ({
                p,
                pts: wolfTotals[p.userId] ?? 0,
                letter:
                  wolfLetterOrder.length > 0
                    ? letterLabelForUser(wolfLetterOrder, p.userId)
                    : null,
              }))
              .sort((a, b) => b.pts - a.pts)
              .map(({ p, pts, letter }) => (
                <View key={p.userId} style={styles.scoreRow}>
                  <Text style={styles.scoreName} numberOfLines={1}>
                    {letter ? `${letter} · ` : ""}
                    {p.isGuest ? `${p.name} (guest)` : p.name}
                  </Text>
                  <Text style={styles.scorePts}>{pts}</Text>
                </View>
              ))}
          </View>
        ) : null}

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
              <ScrollView
                style={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {saving ? (
                  <ActivityIndicator color={colors.fairway} style={{ marginVertical: 20 }} />
                ) : session.gameType === "skins" ? (
                  <SkinsHoleEditor
                    players={players}
                    initial={(editorPayload?.payload as SkinsPayload) ?? null}
                    onCancel={() => setEditorHole(null)}
                    onSave={(p) => void saveHole(p)}
                  />
                ) : session.gameType === "wolf" && editorHole != null ? (
                  <WolfHoleEditor
                    holeNumber={editorHole}
                    letterOrderUserIds={wolfLetterOrder}
                    wolfTeeOff={wolfTeeOffUi}
                    tieHandling={wolfTieHandling}
                    priorHoles={priorWolfHoles}
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
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <RoundOverflowMenuSheet
          visible={gameMenuOpen}
          onClose={() => setGameMenuOpen(false)}
          items={[
            {
              key: "refresh",
              label: "Refresh",
              onPress: () => void load(),
            },
            {
              key: "delete",
              label: "Delete game",
              destructive: true,
              onPress: () => {
                if (!deleteBusy) confirmDeleteGame();
              },
            },
          ]}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  head: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 12 },
  scoreCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  scoreTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  scoreName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  scorePts: { fontSize: 16, fontWeight: "800", color: colors.fairway },
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
  modalScroll: { maxHeight: 420 },
});
