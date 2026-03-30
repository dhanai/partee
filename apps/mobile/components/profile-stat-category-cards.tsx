import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { ProfileStatCategoryId, ProfileStatsGrouped } from "../lib/profile-stats-api";
import { PROFILE_STAT_LABELS, PROFILE_STAT_THEMES } from "../lib/profile-stat-themes";
import {
  ACHIEVEMENT_BADGES_CATALOG,
  DEV_UNLOCKED_BADGE_IDS,
  partitionBadgesForGallery,
} from "../lib/achievement-badges-catalog";
import { getCachedMeProfile } from "../lib/me-profile-cache";
import { colors } from "../lib/theme";
import {
  AchievementBadgeDetailSheet,
  type AchievementBadgeDefinition,
  type BadgeSheetCategory,
} from "./achievement-badge-detail-sheet";
import { AchievementBadge } from "./achievement-badge";
import { AnimatedBottomSheetFrame, BottomSheetScrollView } from "./animated-bottom-sheet-frame";
import { ProfileStatHeroCard } from "./profile-stat-hero-card";

type Props = {
  userId: string;
  grouped: ProfileStatsGrouped | null;
  loading?: boolean;
};

const CATEGORY_IDS: ProfileStatCategoryId[] = ["wolf", "skins", "social"];
const STAT_SNAP_POINTS = ["86%"] as const;

const TITLES: Record<string, string> = {
  wolf: "Wolf",
  skins: "Skins",
  social: "Parfade",
};

export function ProfileStatCategoryCards({ userId, grouped, loading }: Props) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [displayedCat, setDisplayedCat] = useState<ProfileStatCategoryId | null>(null);
  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);
  const [badgeSheet, setBadgeSheet] = useState<{
    badge: AchievementBadgeDefinition;
    unlocked: boolean;
  } | null>(null);

  const isSelf = getCachedMeProfile()?.id === userId;
  const unlockedBadgeIds = isSelf ? new Set(DEV_UNLOCKED_BADGE_IDS) : new Set<string>();

  const openSheet = useCallback((cat: ProfileStatCategoryId) => {
    setDisplayedCat(cat);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const statsHint = isSelf
    ? "Your games, rounds, and badges"
    : "Their games, rounds, and badges";

  if (loading || !grouped) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionTitle}>Stats and achievements</Text>
        <Text style={styles.sectionHint}>{statsHint}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      </View>
    );
  }

  const block = displayedCat ? grouped[displayedCat] : null;
  const theme = displayedCat ? PROFILE_STAT_THEMES[displayedCat] : null;
  const badgeCat = displayedCat as BadgeSheetCategory | null;
  const catalogBadges = badgeCat
    ? ACHIEVEMENT_BADGES_CATALOG.filter((b) => b.category === badgeCat)
    : [];
  const { unlocked: unlockedList, locked: lockedList } = partitionBadgesForGallery(
    catalogBadges,
    unlockedBadgeIds,
  );

  const badgeGridInnerW = windowWidth - 48 - 28;
  const badgeColGap = 10;
  const badgeColW = Math.floor((badgeGridInnerW - badgeColGap * 2) / 3);

  function openBadgeSheet(badge: AchievementBadgeDefinition, unlocked: boolean) {
    setBadgeSheet({ badge, unlocked });
    setBadgeSheetOpen(true);
  }

  function renderBadgeGrid(defs: AchievementBadgeDefinition[]) {
    return (
      <View style={dStyles.badgeGrid}>
        {defs.map((b, i) => {
          const u = unlockedBadgeIds.has(b.id);
          const isLastInRow = (i + 1) % 3 === 0;
          return (
            <View
              key={b.id}
              style={[
                dStyles.badgeGridCell,
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
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Stats and achievements</Text>
      <Text style={styles.sectionHint}>{statsHint}</Text>
      <View style={styles.stack}>
        {CATEGORY_IDS.map((id, index) => (
          <Pressable
            key={id}
            onPress={() => openSheet(id)}
            style={({ pressed }) => [pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${PROFILE_STAT_LABELS[id]} stats and badges`}
          >
            <ProfileStatHeroCard
              category={id}
              block={grouped[id]}
              variant="stack"
              stackPosition={index === 0 ? "first" : index === CATEGORY_IDS.length - 1 ? "last" : "middle"}
            />
          </Pressable>
        ))}
      </View>

      <AnimatedBottomSheetFrame
        visible={sheetVisible}
        onClose={closeSheet}
        snapPoints={STAT_SNAP_POINTS}
        sheetStyle={dStyles.sheetContent}
        backgroundStyle={dStyles.sheetBackground}
      >
        {block && theme && displayedCat ? (
          <BottomSheetScrollView
            style={dStyles.scroll}
            contentContainerStyle={dStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={dStyles.heroWrap}>
              <ProfileStatHeroCard category={displayedCat} block={block} variant="floating" />
            </View>

            <View style={dStyles.section}>
              <View style={dStyles.sectionHeader}>
                <View style={[dStyles.sectionAccent, { backgroundColor: theme.accent }]} />
                <Text style={dStyles.sectionLabel}>Breakdown</Text>
              </View>
              <View style={dStyles.panel}>
                {block.rows.map((row, i) => (
                  <View
                    key={row.label}
                    style={[
                      dStyles.row,
                      i !== block.rows.length - 1 && dStyles.rowDivider,
                      i % 2 === 1 && dStyles.rowAlt,
                    ]}
                  >
                    <Text style={dStyles.rowLabel}>{row.label}</Text>
                    <Text style={[dStyles.rowValue, { color: theme.accent }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={dStyles.section}>
              <View style={dStyles.badgeSectionTop}>
                <View style={dStyles.sectionHeaderInRow}>
                  <View style={[dStyles.sectionAccent, { backgroundColor: theme.accent }]} />
                  <Text style={dStyles.sectionLabel} numberOfLines={1}>Badges</Text>
                </View>
                {displayedCat === "social" ? (
                  <Pressable
                    onPress={() => {
                      closeSheet();
                      router.push("/badges");
                    }}
                    style={({ pressed }) => [dStyles.viewAllBtn, pressed && { opacity: 0.65 }]}
                    hitSlop={8}
                  >
                    <Text style={[dStyles.viewAllText, { color: theme.accent }]}>View all</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={dStyles.badgePanel}>
                {unlockedList.length > 0 ? (
                  <View>
                    <View style={dStyles.badgeBlockHead}>
                      <View style={[dStyles.badgePip, { backgroundColor: theme.accent }]} />
                      <Text style={dStyles.badgeBlockTitle}>Unlocked</Text>
                    </View>
                    {renderBadgeGrid(unlockedList)}
                  </View>
                ) : null}

                {lockedList.length > 0 ? (
                  <View style={unlockedList.length > 0 ? dStyles.badgeBlockSpaced : undefined}>
                    <View style={dStyles.badgeBlockHead}>
                      <View style={[dStyles.badgePip, { backgroundColor: colors.border }]} />
                      <Text style={[dStyles.badgeBlockTitle, { color: colors.muted }]}>Locked</Text>
                    </View>
                    {renderBadgeGrid(lockedList)}
                  </View>
                ) : null}

                {catalogBadges.length === 0 ? (
                  <Text style={dStyles.emptyBadges}>No badges in this category yet.</Text>
                ) : null}
              </View>
            </View>
          </BottomSheetScrollView>
        ) : null}
      </AnimatedBottomSheetFrame>

      <AchievementBadgeDetailSheet
        visible={badgeSheetOpen}
        badge={badgeSheet?.badge ?? null}
        unlocked={badgeSheet?.unlocked ?? false}
        onClose={() => setBadgeSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Matches `ProfileOpenRoundsSection`: full width of scroll content (no horizontal bleed). */
  wrap: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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

const dStyles = StyleSheet.create({
  sheetContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  sheetBackground: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 20,
  },
  heroWrap: {
    paddingHorizontal: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
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
  sectionLabel: {
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
    marginBottom: 12,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingLeft: 10,
  },
  viewAllText: { fontSize: 15, fontWeight: "800" },
  badgePanel: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
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
