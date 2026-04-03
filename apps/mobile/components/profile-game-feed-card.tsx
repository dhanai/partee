import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { GameSessionRecapStandings } from "./games/game-session-recap-standings";
import { getGameSession } from "../lib/games-api";
import type { ProfileGameActivityPayload } from "../lib/profile-game-feed-types";
import { buildProfileGameFinishedHeadline } from "../lib/profile-game-activity-copy";
import { getGameDefinition, useGameTypesVersion } from "../lib/games-registry";
import { refreshGameTypes } from "../lib/game-types-cache";
import { colors } from "../lib/theme";

type Props = {
  profileUserId: string;
  game: ProfileGameActivityPayload;
};

export function ProfileGameFeedCard({ profileUserId, game }: Props) {
  const { getToken } = useAuth();
  const router = useRouter();
  const gameTypesVersion = useGameTypesVersion();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof getGameSession>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await getGameSession(token, game.sessionId, { profileUserId });
      setPayload(data);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : "Could not load game");
    } finally {
      setLoading(false);
    }
  }, [getToken, game.sessionId, profileUserId]);

  useEffect(() => {
    void refreshGameTypes();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const def = getGameDefinition(game.gameType);
  const gameTitle = def?.title ?? game.gameType;
  const headline = buildProfileGameFinishedHeadline(game.subject.name, gameTitle, game.others);

  const openRecap = () => {
    router.push({
      pathname: "/games/session/[sessionId]",
      params: { sessionId: game.sessionId, recap: "1" },
    });
  };

  return (
    <Pressable
      onPress={openRecap}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open game recap: ${headline}`}
    >
      <Text style={styles.badge}>Game</Text>
      <Text style={styles.headline}>{headline}</Text>
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
            includeRecapExtras
            holesLogged={payload.holes.length}
          />
        </View>
      ) : null}
      <Text style={styles.hint}>Tap for full recap</Text>
    </Pressable>
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
  cardPressed: { opacity: 0.92 },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "800",
    color: colors.fairway,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  headline: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 22,
    marginBottom: 4,
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
  hint: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "700",
    color: colors.fairway,
  },
});
