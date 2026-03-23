import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ProfileStatCategoryId, ProfileStatsGrouped } from "../lib/profile-stats-api";
import { PROFILE_STAT_LABELS } from "../lib/profile-stat-themes";
import { ProfileStatHeroCard } from "./profile-stat-hero-card";
import { colors } from "../lib/theme";

type Props = {
  userId: string;
  grouped: ProfileStatsGrouped | null;
  loading?: boolean;
};

export function ProfileStatCategoryCards({ userId, grouped, loading }: Props) {
  const router = useRouter();

  function go(category: ProfileStatCategoryId) {
    router.push({
      pathname: "/profile/[userId]/stats/[category]",
      params: { userId, category },
    });
  }

  if (loading || !grouped) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionTitle}>Stats and achievements</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      </View>
    );
  }

  const ids: ProfileStatCategoryId[] = ["wolf", "skins", "social"];

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Stats and achievements</Text>
      <View style={styles.stack}>
        {ids.map((id, index) => (
          <Pressable
            key={id}
            onPress={() => go(id)}
            style={({ pressed }) => [pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${PROFILE_STAT_LABELS[id]} stats and badges`}
          >
            <ProfileStatHeroCard
              category={id}
              block={grouped[id]}
              variant="stack"
              stackPosition={index === 0 ? "first" : index === ids.length - 1 ? "last" : "middle"}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 22,
    marginHorizontal: -16,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
    marginBottom: 14,
    paddingHorizontal: 16,
    textAlign: "center",
    width: "100%",
  },
  loadingRow: {
    paddingVertical: 28,
    alignItems: "center",
  },
  stack: {
    width: "100%",
    paddingHorizontal: 0,
  },
  cardPressed: {
    opacity: 0.92,
  },
});
