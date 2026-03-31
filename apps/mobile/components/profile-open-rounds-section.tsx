import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RoundListCard } from "./round-list-card";
import { apiGet } from "../lib/api";
import { prefetchPublicProfile } from "../lib/public-profile-cache";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
  getTimeWindows,
  resolveTournamentTitle,
} from "../lib/round-card-meta";
import { buildRoundListHint, prefetchRoundOpen } from "../lib/round-details-cache";
import { colors } from "../lib/theme";
import type { MineRound } from "../types/round";

type ProfileOpenRoundApi = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  tournamentTitle: string | null;
  mode: "scheduled" | "planning" | "tournament";
  teeTime: string | null;
  targetDate: string;
  imageUrl: string;
  totalSpots: number;
  spotsRemaining: number;
  joinPolicy: "instant" | "approval";
  preferredTimeWindow: string | null;
  preferredTimeWindows: string[] | null;
  planningLocation: string | null;
  confirmedPlayers: Array<{ id: string; name: string; avatar: string | null }>;
};
type ProfileOpenRoundsApiResponse = {
  rounds?: ProfileOpenRoundApi[];
  hosting?: ProfileOpenRoundApi[];
  joined?: ProfileOpenRoundApi[];
};

function toMineRoundForHint(r: ProfileOpenRoundApi): MineRound {
  return {
    id: r.id,
    inviteToken: r.inviteToken,
    courseName: r.courseName,
    tournamentTitle: r.tournamentTitle ?? null,
    teeTime: r.teeTime,
    targetDate: r.targetDate,
    mode: r.mode,
    preferredTimeWindow: r.preferredTimeWindow,
    preferredTimeWindows: r.preferredTimeWindows,
    planningLocation: r.planningLocation,
    status: "forming",
    joinPolicy: r.joinPolicy,
    imageUrl: r.imageUrl,
    totalSpots: r.totalSpots,
    spotsRemaining: r.spotsRemaining,
    confirmedPlayers: r.confirmedPlayers,
  };
}

type Props = {
  userId: string;
  /** True on the signed-in user’s own profile tab. */
  viewerIsSelf?: boolean;
  /** Optional signal so parent screens can render combined empty states. */
  onDataStateChange?: (state: { loading: boolean; hostingCount: number; joinedCount: number }) => void;
};

export function ProfileOpenRoundsSection({
  userId,
  viewerIsSelf = false,
  onDataStateChange,
}: Props) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [hostingRounds, setHostingRounds] = useState<ProfileOpenRoundApi[] | null>(null);
  const [joinedRounds, setJoinedRounds] = useState<ProfileOpenRoundApi[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onDataStateChange?.({
      loading,
      hostingCount: hostingRounds?.length ?? 0,
      joinedCount: joinedRounds?.length ?? 0,
    });
  }, [loading, hostingRounds, joinedRounds, onDataStateChange]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const token = await getToken();
          const data = await apiGet<ProfileOpenRoundsApiResponse>(
            `/api/users/${userId}/open-rounds`,
            token,
          );
          if (cancelled) return;
          const fallbackRounds = data.rounds ?? [];
          setHostingRounds(data.hosting ?? fallbackRounds);
          setJoinedRounds(data.joined ?? []);
        } catch {
          if (!cancelled) {
            setHostingRounds([]);
            setJoinedRounds([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, getToken]),
  );

  if (loading && hostingRounds === null && joinedRounds === null) {
    return (
      <View style={[styles.section, styles.loadingSection]}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const hosted = hostingRounds ?? [];
  const joined = joinedRounds ?? [];
  if (hosted.length === 0 && joined.length === 0) {
    return null;
  }

  const renderRoundCard = (round: ProfileOpenRoundApi) => {
    const effectiveIso = round.teeTime ?? round.targetDate;
    const mine = toMineRoundForHint(round);
    return (
      <View key={round.id} style={styles.cardWrap}>
        <RoundListCard
          roundId={round.id}
          mode={
            round.mode === "planning"
              ? "planning"
              : round.mode === "tournament"
                ? "tournament"
                : "scheduled"
          }
          courseName={round.courseName}
          tournamentTitle={resolveTournamentTitle(round)}
          inviteToken={round.inviteToken}
          imageUrl={round.imageUrl}
          joinPolicy={round.joinPolicy}
          totalSpots={round.totalSpots}
          confirmedPlayers={round.confirmedPlayers}
          onCardPressIn={() =>
            prefetchRoundOpen(round.inviteToken, round.imageUrl, () => getToken())
          }
          onPress={() =>
            router.push({
              pathname: "/round/[token]",
              params: {
                token: round.inviteToken,
                roundHint: buildRoundListHint(mine),
              },
            })
          }
          primaryMeta={
            round.mode === "scheduled" || round.mode === "tournament"
              ? formatScheduledCardMeta(effectiveIso, round.teeTime)
              : formatPlanningWindow(getTimeWindows(round))
          }
          planningLocation={round.planningLocation}
          planningHeaderDate={formatPlanningHeaderDate(round.targetDate)}
          preferredTimeWindow={getTimeWindows(round)}
          onPlayerPress={(player) =>
            router.push({
              pathname: "/profile/[userId]",
              params: {
                userId: player.id,
                userName: player.name,
                userAvatar: player.avatar ?? "",
              },
            })
          }
          onPlayerPressIn={(player) => prefetchPublicProfile(player.id, () => getToken())}
          trailingAfterSpots={
            round.spotsRemaining === 0 ? (
              <Text style={styles.fullBadge}>Full</Text>
            ) : undefined
          }
        />
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Rounds</Text>
      <Text style={styles.sectionHint}>
        {viewerIsSelf
          ? "Your upcoming hosted and joined rounds"
          : "Upcoming rounds they are hosting or joined"}
      </Text>
      {hosted.length > 0 ? <Text style={styles.subSectionTitle}>Hosting</Text> : null}
      {hosted.map((round) => renderRoundCard(round))}
      {joined.length > 0 ? <Text style={styles.subSectionTitle}>Joined</Text> : null}
      {joined.map((round) => renderRoundCard(round))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 28,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 2,
  },
  loadingSection: {
    marginBottom: 0,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: {
    marginBottom: 10,
  },
  fullBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
});
