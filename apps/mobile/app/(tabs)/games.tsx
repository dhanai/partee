import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAbly } from "ably/react";
import { Ionicons } from "@expo/vector-icons";
import { SwipeableMineRoundRow } from "../../components/swipeable-mine-round-row";
import { deleteGameSession, listMyGameSessions, type GameSessionSummary } from "../../lib/games-api";
import { getGameDefinitions, getGameDefinition, type GameDefinition } from "../../lib/games-registry";
import { loadGameTypesFromStorage, refreshGameTypes } from "../../lib/game-types-cache";
import { subscribeGamesListRefresh } from "../../lib/games-list-refresh";
import { parfadeGameSessionChannel } from "../../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../../lib/parfade-ably-messages";
import { useSnackbar } from "../../lib/snackbar-context";
import { colors } from "../../lib/theme";

function statusLabel(s: GameSessionSummary["status"]) {
  if (s === "active") return "Active";
  if (s === "completed") return "Done";
  return "Abandoned";
}

/** Avoid re-rendering the grid when API returns the same copy (new array reference every time). */
function gameGridSignature(defs: GameDefinition[]): string {
  return defs
    .filter((g) => g.implemented)
    .map((g) => `${g.id}\t${g.title}\t${g.subtitle}`)
    .sort()
    .join("\n");
}

function mergeGameDefsIfChanged(prev: GameDefinition[], next: GameDefinition[]): GameDefinition[] {
  if (gameGridSignature(prev) === gameGridSignature(next)) return prev;
  return next;
}

function formatSessionListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString("en-US", opts);
}

export default function GamesScreen() {
  const router = useRouter();
  const { roundInviteToken } = useLocalSearchParams<{ roundInviteToken?: string }>();
  const { getToken } = useAuth();
  const { show: showSnackbar } = useSnackbar();
  const [sessions, setSessions] = useState<GameSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listScrollLockedForRowSwipe, setListScrollLockedForRowSwipe] = useState(false);
  const [gameDefs, setGameDefs] = useState<GameDefinition[]>([]);
  const [gameGridReady, setGameGridReady] = useState(false);

  const onGameRowSwipeActiveChange = useCallback((active: boolean) => {
    setListScrollLockedForRowSwipe(active);
  }, []);

  const performDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const token = await getToken();
        await deleteGameSession(token, sessionId);
        setSessions((prev) => prev.filter((x) => x.id !== sessionId));
        showSnackbar("Game deleted");
      } catch (e) {
        Alert.alert("Could not delete", e instanceof Error ? e.message : "Could not delete");
      }
    },
    [getToken, showSnackbar],
  );

  const confirmDeleteSession = useCallback(
    (s: GameSessionSummary) => {
      Alert.alert(
        "Delete game?",
        "This removes the game and all recorded holes for everyone in the group.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setTimeout(() => void performDeleteSession(s.id), 0);
            },
          },
        ],
      );
    },
    [performDeleteSession],
  );

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await listMyGameSessions(token);
      setSessions(data.sessions ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load games");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
      let cancelled = false;
      void (async () => {
        await loadGameTypesFromStorage();
        if (cancelled) return;
        setGameDefs(getGameDefinitions());
        setGameGridReady(true);
        await refreshGameTypes();
        if (cancelled) return;
        setGameDefs((prev) => mergeGameDefsIfChanged(prev, getGameDefinitions()));
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  useEffect(() => subscribeGamesListRefresh(() => void load()), [load]);

  const ably = useAbly();
  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  useEffect(() => {
    if (sessionIds.length === 0) return;
    const subs: { channel: ReturnType<typeof ably.channels.get>; handler: (msg: import("ably").Message) => void }[] = [];
    for (const id of sessionIds) {
      const channel = ably.channels.get(parfadeGameSessionChannel(id));
      const handler = (msg: import("ably").Message) => {
        const parsed = parseParfadeRealtimeMessage(msg.data);
        if (parsed?.type === "game-session-updated") {
          if (parsed.reason === "deleted") {
            setSessions((prev) => prev.filter((s) => s.id !== id));
          } else {
            void load();
          }
        }
      };
      void channel.subscribe("parfade", handler);
      subs.push({ channel, handler });
    }
    return () => {
      for (const { channel, handler } of subs) {
        void channel.unsubscribe("parfade", handler);
      }
    };
  }, [ably, sessionIds, load]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      scrollEnabled={!listScrollLockedForRowSwipe}
      directionalLockEnabled={Platform.OS === "ios"}
      nestedScrollEnabled
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void (async () => {
              try {
                await load();
                await loadGameTypesFromStorage();
                await refreshGameTypes();
                setGameDefs((prev) => mergeGameDefsIfChanged(prev, getGameDefinitions()));
              } finally {
                setRefreshing(false);
              }
            })();
          }}
          tintColor={colors.fairway}
        />
      }
    >
      <Text style={styles.heading}>Games</Text>
      <Text style={styles.subheading}>
        Side games with your group.
      </Text>

      {roundInviteToken ? (
        <View style={styles.roundBanner}>
          <Text style={styles.roundBannerText}>
            Pick a game for this round — confirmed players are added automatically.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Start a game</Text>
      {!gameGridReady ? (
        <ActivityIndicator color={colors.fairway} style={styles.gridLoader} />
      ) : (
        <View style={styles.gameGrid}>
          {gameDefs.filter((g) => g.implemented).map((g) => (
            <Pressable
              key={g.id}
              style={({ pressed }) => [styles.gameCard, pressed && styles.gameCardPressed]}
              onPress={() => {
                router.push({
                  pathname: "/games/create",
                  params: {
                    gameType: g.id,
                    ...(roundInviteToken
                      ? { roundInviteToken: String(roundInviteToken) }
                      : {}),
                  },
                });
              }}
            >
              <Ionicons name="golf-outline" size={22} color={colors.fairway} />
              <Text style={styles.gameTitle}>{g.title}</Text>
              <Text style={styles.gameSub} numberOfLines={2}>
                {g.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>Your sessions</Text>
      {loading ? (
        <ActivityIndicator color={colors.fairway} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>No games yet — pick a format above.</Text>
      ) : (
        sessions.map((s) => {
          const def = getGameDefinition(s.gameType);
          const swipeEnabled = Platform.OS !== "web";
          const openSession = () => {
            if (s.status === "completed") {
              const invite = s.roundInviteToken?.trim();
              if (invite) {
                router.push({
                  pathname: "/round/[token]/results",
                  params: { token: invite },
                });
              } else {
                router.push({
                  pathname: "/games/session/[sessionId]",
                  params: { sessionId: s.id, recap: "1" },
                });
              }
              return;
            }
            router.push({
              pathname: "/games/session/[sessionId]",
              params: { sessionId: s.id },
            });
          };
          return (
            <View key={s.id} style={styles.sessionSwipeWrap}>
            <SwipeableMineRoundRow
              variant="host"
              enabled={swipeEnabled}
              compact
              hostLeftLabel="Settings"
              hostLeftIcon="options-outline"
              onSwipeActiveChange={onGameRowSwipeActiveChange}
              onHostEdit={() => {
                router.push({
                  pathname: "/games/session/[sessionId]/settings",
                  params: { sessionId: s.id },
                });
              }}
              onHostDelete={() => confirmDeleteSession(s)}
            >
              <Pressable
                style={({ pressed }) => [styles.sessionRow, pressed && styles.sessionRowPressed]}
                unstable_pressDelay={swipeEnabled ? 200 : undefined}
                android_ripple={swipeEnabled ? null : undefined}
                onPress={openSession}
              >
                <View style={styles.sessionTextCol}>
                  <Text style={styles.sessionTitle}>{def?.title ?? s.gameType}</Text>
                  <Text style={styles.sessionMeta}>
                    {formatSessionListDate(s.startedAt || s.createdAt)} · {s.holesCount} holes ·{" "}
                    {statusLabel(s.status)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            </SwipeableMineRoundRow>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 14 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  gridLoader: { minHeight: 120, marginBottom: 28 },
  gameGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  gameCard: {
    width: "47%",
    minWidth: 150,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 6,
  },
  gameCardPressed: { opacity: 0.92 },
  gameTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  gameSub: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  loader: { marginVertical: 20 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: { color: colors.muted, fontSize: 14 },
  roundBanner: {
    backgroundColor: colors.fairwaySoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roundBannerText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  sessionSwipeWrap: {
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sessionRowPressed: { opacity: 0.9 },
  sessionTextCol: { flex: 1, gap: 2 },
  sessionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  sessionMeta: { fontSize: 13, color: colors.muted },
});
