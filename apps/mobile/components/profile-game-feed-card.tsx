import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GameSessionRecapStandings } from "./games/game-session-recap-standings";
import { getGameSession } from "../lib/games-api";
import type { ProfileGameActivityPayload } from "../lib/profile-game-feed-types";
import { buildProfileGameFinishedHeadlineSegments } from "../lib/profile-game-activity-copy";
import { getGameDefinition, useGameTypesVersion } from "../lib/games-registry";
import { colors } from "../lib/theme";

type Props = {
  profileUserId: string;
  game: ProfileGameActivityPayload;
  showOverflow?: boolean;
  onPressOverflow?: () => void;
};

export function ProfileGameFeedCard({
  profileUserId,
  game,
  showOverflow = false,
  onPressOverflow,
}: Props) {
  const { getToken } = useAuth();
  const router = useRouter();
  const gameTypesVersion = useGameTypesVersion();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof getGameSession>> | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    const sessionId = game.sessionId;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await getGameSession(token, sessionId, { profileUserId });
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setError(e instanceof Error ? e.message : "Could not load game");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.sessionId, profileUserId]);

  const def = getGameDefinition(game.gameType);
  const gameTitle = def?.title ?? game.gameType;
  const headlineSegments = buildProfileGameFinishedHeadlineSegments(
    game.subject.name,
    gameTitle,
    game.others,
  );
  const headlinePlain = headlineSegments.map((s) => s.text).join("");

  const openRecap = () => {
    router.push({
      pathname: "/games/session/[sessionId]",
      params: { sessionId: game.sessionId, recap: "1" },
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.badge}>Game</Text>
        <View style={styles.cardHeaderSpacer} />
        {game.isPinned ? <Ionicons name="pin" size={14} color={colors.muted} /> : null}
        {showOverflow && onPressOverflow ? (
          <Pressable
            style={styles.overflowBtn}
            onPress={onPressOverflow}
            hitSlop={8}
            accessibilityLabel="Game options"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={openRecap}
        style={({ pressed }) => [styles.cardBody, pressed && styles.cardBodyPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Open game recap: ${headlinePlain}`}
      >
        <Text style={styles.headline}>
          {headlineSegments.map((s, i) => (
            <Text key={i} style={s.bold ? styles.headlineName : undefined}>
              {s.text}
            </Text>
          ))}
        </Text>
        <Text style={styles.meta}>
          {new Date(game.endedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.fairway} />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : payload?.session ? (
          <View style={styles.recapInner} pointerEvents="none">
            <GameSessionRecapStandings
              session={payload.session}
              players={payload.players}
              holes={payload.holes}
              gameTypesVersion={gameTypesVersion}
              includeRecapExtras={false}
              holesLogged={payload.holes.length}
            />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  cardHeaderSpacer: { flex: 1 },
  overflowBtn: { padding: 2 },
  cardBody: { borderRadius: 0 },
  cardBodyPressed: { opacity: 0.92 },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "800",
    color: colors.fairway,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headline: {
    fontSize: 16,
    fontWeight: "400",
    color: colors.text,
    lineHeight: 22,
    marginBottom: 4,
  },
  headlineName: {
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 12,
  },
  recapInner: { marginTop: 4 },
  center: { paddingVertical: 24, alignItems: "center" },
  errorText: { fontSize: 14, color: colors.danger, paddingVertical: 8 },
});
