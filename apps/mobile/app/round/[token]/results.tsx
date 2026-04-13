import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { fetchRoundResults, type RoundResultsResponse } from "../../../lib/round-results-api";
import { getGameDefinition } from "../../../lib/games-registry";
import { toAbsoluteUrl } from "../../../lib/api";
import { colors } from "../../../lib/theme";

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return "?";
  return t.split(/\s+/)[0] ?? t;
}

function formatWhen(r: RoundResultsResponse["round"]): string {
  if (r.mode === "scheduled" && r.teeTime) {
    const d = new Date(r.teeTime);
    return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  if (r.targetDate) {
    const d = new Date(r.targetDate);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  return "Date TBD";
}

export default function RoundResultsScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const inviteToken = Array.isArray(token) ? token[0] : token;
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [data, setData] = useState<RoundResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!inviteToken) return;
    if (!data) setLoading(true);
    setError(null);
    try {
      const auth = await getTokenRef.current();
      const res = await fetchRoundResults(auth, inviteToken);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [inviteToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!inviteToken) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing round.</Text>
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

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Not found"}</Text>
        <Pressable style={styles.retry} onPress={() => void load()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { round, standings, highlights } = data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Round recap</Text>
        <Text style={styles.heroTitle}>{round.courseName}</Text>
        <Text style={styles.heroSub}>{formatWhen(round)}</Text>
        {round.status === "completed" ? (
          <View style={styles.donePill}>
            <Ionicons name="checkmark-circle" size={16} color="#b8f5d0" />
            <Text style={styles.donePillText}>Complete</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Standings</Text>
      <Text style={styles.sectionHint}>Wolf points from completed games linked to this round</Text>

      {standings.map((p, index) => {
        const rank = index + 1;
        const fn = firstName(p.name);
        return (
          <View
            key={p.userId}
            style={[
              styles.row,
              rank === 1 && styles.rowGold,
              rank === 2 && styles.rowSilver,
              rank === 3 && styles.rowBronze,
            ]}
          >
            <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>{rank}</Text>
            <Pressable
              style={styles.rowTap}
              disabled={p.isGuest}
              onPress={() =>
                router.push({
                  pathname: "/profile/[userId]",
                  params: {
                    userId: p.userId,
                    userName: p.name,
                    userAvatar: p.avatar ?? "",
                  },
                })
              }
            >
              {p.avatar ? (
                <Image source={{ uri: toAbsoluteUrl(p.avatar) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{fn.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {fn}
                  {p.isGuest ? <Text style={styles.guestTag}> · guest</Text> : null}
                </Text>
                <Text style={styles.rowFullName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
            </Pressable>
            <Text style={styles.pts}>
              {p.wolfPoints > 0 ? `+${p.wolfPoints}` : p.wolfPoints}
            </Text>
          </View>
        );
      })}

      {highlights.length > 0 ? (
        <View style={styles.statsBlock}>
          <Text style={styles.sectionTitle}>Stats</Text>
          {highlights.map((line, i) => (
            <View key={i} style={styles.highlightCard}>
              <Ionicons name="sparkles" size={20} color={colors.fairway} style={styles.highlightIcon} />
              <Text style={styles.highlightText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {(data.gameSessions ?? []).length > 0 ? (
        <View style={styles.gameLinksSection}>
          {data.gameSessions!.map((gs) => {
            const def = getGameDefinition(gs.gameType);
            const label = def?.title ?? gs.gameType;
            return (
              <Pressable
                key={gs.id}
                style={styles.completeBtn}
                onPress={() =>
                  router.push(`/games/session/${gs.id}?recap=0` as Href)
                }
              >
                <Text style={styles.completeBtnText}>
                  {label} — hole-by-hole breakdown
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        style={styles.backBtn}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(`/round/${inviteToken}`))}
      >
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  muted: { fontSize: 15, color: colors.muted },
  error: { color: colors.danger, textAlign: "center", marginBottom: 12 },
  retry: { paddingVertical: 10, paddingHorizontal: 16 },
  retryText: { fontWeight: "700", color: colors.fairway },
  hero: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.fairway,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.88)", marginTop: 8 },
  donePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  donePillText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: 8 },
  sectionHint: { fontSize: 13, color: colors.muted, marginTop: -4, marginBottom: 12 },
  statsBlock: { marginTop: 8, marginBottom: 20 },
  highlightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  highlightIcon: { marginTop: 2 },
  highlightText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text, lineHeight: 22 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowGold: { backgroundColor: "#f7f2e4", borderColor: "#e8d9b8" },
  rowSilver: { backgroundColor: "#f0f1f3", borderColor: "#e0e2e6" },
  rowBronze: { backgroundColor: "#faf0e8", borderColor: "#edd9cc" },
  rank: { width: 24, fontSize: 15, fontWeight: "800", color: colors.muted, textAlign: "center" },
  rankTop: { color: colors.fairway },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 18, fontWeight: "800", color: colors.fairway },
  rowTap: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 17, fontWeight: "800", color: colors.text },
  rowFullName: { fontSize: 12, color: colors.muted, marginTop: 2 },
  guestTag: { fontWeight: "600", color: colors.muted },
  pts: { fontSize: 18, fontWeight: "800", color: colors.fairway, minWidth: 44, textAlign: "right" },
  gameLinksSection: { marginTop: 20, gap: 10 },
  completeBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.fairway,
  },
  completeBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  backBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtnText: { fontSize: 16, fontWeight: "800", color: colors.text },
});
