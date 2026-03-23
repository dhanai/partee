import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useLayoutEffect, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  AchievementBadgeDetailSheet,
  type AchievementBadgeDefinition,
  type BadgeSheetCategory,
} from "../../../../components/achievement-badge-detail-sheet";
import { AchievementBadge } from "../../../../components/achievement-badge";
import { ProfileStatHeroCard } from "../../../../components/profile-stat-hero-card";
import {
  ACHIEVEMENT_BADGES_CATALOG,
  DEV_UNLOCKED_BADGE_IDS,
  partitionBadgesForGallery,
} from "../../../../lib/achievement-badges-catalog";
import { getCachedMeProfile } from "../../../../lib/me-profile-cache";
import {
  ensureSkinsFourthColumn,
  fetchUserStats,
  type ProfileStatCategoryId,
  type ProfileStatsGrouped,
} from "../../../../lib/profile-stats-api";
import { PROFILE_STAT_THEMES } from "../../../../lib/profile-stat-themes";
import { colors } from "../../../../lib/theme";

const VALID = new Set<string>(["wolf", "skins", "social"]);

const TITLES: Record<string, string> = {
  wolf: "Wolf",
  skins: "Skins",
  social: "Parfade",
};

function normParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default function ProfileCategoryStatsScreen() {
  const router = useRouter();
  const { userId: rawUserId, category: rawCategory } = useLocalSearchParams<{
    userId: string;
    category: string;
  }>();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const userId = normParam(rawUserId);
  const category = normParam(rawCategory);

  const [grouped, setGrouped] = useState<ProfileStatsGrouped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);
  const [badgeSheet, setBadgeSheet] = useState<{
    badge: AchievementBadgeDefinition;
    unlocked: boolean;
  } | null>(null);

  const intro = useSharedValue(0);
  const details = useSharedValue(0);

  const isSelf = getCachedMeProfile()?.id === userId;
  const unlockedBadgeIds = isSelf ? new Set(DEV_UNLOCKED_BADGE_IDS) : new Set<string>();

  const lift = Math.min(160, Math.round(windowHeight * 0.18));

  useFocusEffect(
    useCallback(() => {
      getTokenRef.current = getToken;
    }, [getToken]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: TITLES[category] ?? "Stats" });
  }, [navigation, category]);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !VALID.has(category)) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const token = await getTokenRef.current();
          const json = await fetchUserStats(token, userId);
          if (!cancelled) setGrouped(ensureSkinsFourthColumn(json.grouped, json.stats));
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Unable to load stats.");
            setGrouped(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, category]),
  );

  const cat = category as ProfileStatCategoryId;
  const block = grouped?.[cat];
  const theme = PROFILE_STAT_THEMES[cat];

  useEffect(() => {
    intro.value = 0;
    details.value = 0;
  }, [category]);

  useEffect(() => {
    if (!block || loading) return;
    intro.value = 0;
    details.value = 0;
    intro.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    details.value = withDelay(
      240,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated shared values
  }, [block, loading, category]);

  const heroStyle = useAnimatedStyle(() => {
    const t = intro.value;
    return {
      opacity: 0.92 + 0.08 * t,
      transform: [{ translateY: (1 - t) * lift }, { scale: 0.96 + 0.04 * t }],
    };
  });

  const detailsStyle = useAnimatedStyle(() => {
    const t = details.value;
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 10 }],
    };
  });

  function openBadgeSheet(badge: AchievementBadgeDefinition, unlocked: boolean) {
    setBadgeSheet({ badge, unlocked });
    setBadgeSheetOpen(true);
  }

  if (!VALID.has(category)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Unknown category.</Text>
      </View>
    );
  }

  const badgeCat = cat as BadgeSheetCategory;
  const catalogBadges = ACHIEVEMENT_BADGES_CATALOG.filter((b) => b.category === badgeCat);
  const { unlocked: unlockedList, locked: lockedList } = partitionBadgesForGallery(
    catalogBadges,
    unlockedBadgeIds,
  );

  /** Section (20) + badge panel (14) horizontal padding — must match styles.section / badgePanel. */
  const badgeGridInnerW = windowWidth - 40 - 28;
  const badgeColGap = 10;
  const badgeColW = Math.floor((badgeGridInnerW - badgeColGap * 2) / 3);

  function renderBadgeGrid(defs: AchievementBadgeDefinition[]) {
    return (
      <View style={styles.badgeGrid}>
        {defs.map((b, i) => {
          const u = unlockedBadgeIds.has(b.id);
          const isLastInRow = (i + 1) % 3 === 0;
          return (
            <View
              key={b.id}
              style={[
                styles.badgeGridCell,
                { width: badgeColW },
                !isLastInRow && { marginRight: badgeColGap },
              ]}
            >
              <AchievementBadge
                icon={b.icon}
                tint={b.tint}
                label={b.label}
                size="md"
                unlocked={u}
                onPress={() => openBadgeSheet(b, u)}
              />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <>
      <View style={styles.root}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.fairway} size="large" />
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : block ? (
            <>
              <Animated.View style={[styles.heroWrap, heroStyle]}>
                <ProfileStatHeroCard category={cat} block={block} variant="floating" />
                {block.subtitle ? (
                  <Text style={styles.heroSubtitle} numberOfLines={2}>
                    {block.subtitle}
                  </Text>
                ) : null}
              </Animated.View>

              <Animated.View style={detailsStyle}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionAccent, { backgroundColor: theme.accent }]} />
                    <Text style={styles.sectionTitle}>Breakdown</Text>
                  </View>
                  <View style={styles.panel}>
                    {block.rows.map((row, i) => (
                      <View
                        key={row.label}
                        style={[
                          styles.row,
                          i !== block.rows.length - 1 && styles.rowDivider,
                          i % 2 === 1 && styles.rowAlt,
                        ]}
                      >
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text style={[styles.rowValue, { color: theme.accent }]}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.section}>
                  <View style={styles.badgeSectionTop}>
                    <View style={styles.sectionHeaderInRow}>
                      <View style={[styles.sectionAccent, { backgroundColor: theme.accent }]} />
                      <Text style={styles.sectionTitle} numberOfLines={1}>
                        Badges
                      </Text>
                    </View>
                    {cat === "social" ? (
                      <Pressable
                        onPress={() => router.push("/badges")}
                        style={({ pressed }) => [styles.viewAllBtn, pressed && styles.viewAllPressed]}
                        hitSlop={8}
                      >
                        <Text style={[styles.viewAllText, { color: theme.accent }]}>View all</Text>
                        <Ionicons name="chevron-forward" size={18} color={theme.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={styles.badgeHint}>
                    {isSelf
                      ? `${unlockedList.length} of ${catalogBadges.length} unlocked in this category`
                      : `Badges for ${TITLES[category]}`}
                  </Text>

                  <View style={styles.badgePanel}>
                    {unlockedList.length > 0 ? (
                      <View style={styles.badgeBlock}>
                        <View style={styles.badgeBlockHead}>
                          <View style={[styles.badgePip, { backgroundColor: theme.accent }]} />
                          <Text style={styles.badgeBlockTitle}>Unlocked</Text>
                        </View>
                        {renderBadgeGrid(unlockedList)}
                      </View>
                    ) : null}

                    {lockedList.length > 0 ? (
                      <View
                        style={[
                          styles.badgeBlock,
                          unlockedList.length > 0 && styles.badgeBlockSpaced,
                        ]}
                      >
                        <View style={styles.badgeBlockHead}>
                          <View style={[styles.badgePip, { backgroundColor: colors.border }]} />
                          <Text style={[styles.badgeBlockTitle, styles.badgeBlockTitleMuted]}>
                            Locked
                          </Text>
                        </View>
                        {renderBadgeGrid(lockedList)}
                      </View>
                    ) : null}

                    {catalogBadges.length === 0 ? (
                      <Text style={styles.emptyBadges}>No badges in this category yet.</Text>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
      </View>
      <AchievementBadgeDetailSheet
        visible={badgeSheetOpen}
        badge={badgeSheet?.badge ?? null}
        unlocked={badgeSheet?.unlocked ?? false}
        onClose={() => setBadgeSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  content: { paddingBottom: 48, paddingTop: 8 },
  heroWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  heroSubtitle: {
    marginTop: 12,
    marginHorizontal: 4,
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingBox: { paddingVertical: 56, alignItems: "center" },
  errorWrap: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionHeaderInRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    marginRight: 8,
  },
  sectionAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  panel: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#2a2419",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowAlt: {
    backgroundColor: "rgba(26, 60, 42, 0.03)",
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  rowValue: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  badgeSectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingLeft: 10,
  },
  viewAllPressed: { opacity: 0.65 },
  viewAllText: { fontSize: 15, fontWeight: "800" },
  badgeHint: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 14,
    lineHeight: 18,
    marginTop: 4,
  },
  badgePanel: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: "#2a2419",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  badgeBlock: {},
  badgeBlockSpaced: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  badgeBlockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  badgePip: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeBlockTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  badgeBlockTitleMuted: {
    color: colors.muted,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 22,
    justifyContent: "flex-start",
  },
  badgeGridCell: {
    alignItems: "center",
  },
  emptyBadges: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 8,
  },
});
