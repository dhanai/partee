import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GAME_DEFINITIONS, getGameDefinition } from "../../../lib/games-registry";
import { listMyGameSessions, type GameSessionSummary } from "../../../lib/games-api";
import { colors } from "../../../lib/theme";

function statusLabel(s: GameSessionSummary["status"]) {
  if (s === "active") return "Active";
  if (s === "completed") return "Done";
  return "Abandoned";
}

export default function GamesIndexScreen() {
  const router = useRouter();
  const { roundInviteToken } = useLocalSearchParams<{ roundInviteToken?: string }>();
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<GameSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await listMyGameSessions(token);
      setSessions(data.sessions);
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
    }, [load]),
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.fairway}
        />
      }
    >
      <Text style={styles.heading}>Games</Text>
      <Text style={styles.subheading}>
        Side games with your group — start Skins, Wolf, or pick up where you left off.
      </Text>

      {roundInviteToken ? (
        <View style={styles.roundBanner}>
          <Text style={styles.roundBannerText}>
            Pick a game for this round — confirmed players are added automatically.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Start a game</Text>
      <View style={styles.gameGrid}>
        {GAME_DEFINITIONS.map((g) => (
          <Pressable
            key={g.id}
            style={({ pressed }) => [styles.gameCard, pressed && styles.gameCardPressed]}
            onPress={() => {
              if (!g.implemented) return;
              router.push({
                pathname: "/(tabs)/games/create",
                params: {
                  gameType: g.id,
                  ...(roundInviteToken
                    ? { roundInviteToken: String(roundInviteToken) }
                    : {}),
                },
              });
            }}
          >
            <Ionicons
              name={g.implemented ? "golf-outline" : "lock-closed-outline"}
              size={22}
              color={g.implemented ? colors.fairway : colors.muted}
            />
            <Text style={styles.gameTitle}>{g.title}</Text>
            <Text style={styles.gameSub} numberOfLines={2}>
              {g.subtitle}
            </Text>
            {!g.implemented ? (
              <Text style={styles.soon}>Coming soon</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

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
          return (
            <Pressable
              key={s.id}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.sessionRowPressed]}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/games/session/[sessionId]",
                  params: { sessionId: s.id },
                })
              }
            >
              <View style={styles.sessionTextCol}>
                <Text style={styles.sessionTitle}>{def?.title ?? s.gameType}</Text>
                <Text style={styles.sessionMeta}>
                  {s.holesCount} holes · {statusLabel(s.status)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
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
  soon: { fontSize: 11, fontWeight: "600", color: colors.muted, marginTop: 4 },
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  sessionRowPressed: { opacity: 0.9 },
  sessionTextCol: { flex: 1, gap: 2 },
  sessionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  sessionMeta: { fontSize: 13, color: colors.muted },
});
