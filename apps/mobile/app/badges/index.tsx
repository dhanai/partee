import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AchievementBadge } from "../../components/achievement-badge";
import {
  AchievementBadgeDetailSheet,
  type AchievementBadgeDefinition,
} from "../../components/achievement-badge-detail-sheet";
import {
  ACHIEVEMENT_BADGES_CATALOG,
  DEV_UNLOCKED_BADGE_IDS,
  partitionBadgesForGallery,
} from "../../lib/achievement-badges-catalog";
import { colors } from "../../lib/theme";

export default function AllBadgesScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheet] = useState<{
    badge: AchievementBadgeDefinition;
    unlocked: boolean;
  } | null>(null);

  const unlockedIds = useMemo(() => new Set<string>(DEV_UNLOCKED_BADGE_IDS), []);
  const { unlocked, locked } = useMemo(
    () => partitionBadgesForGallery(ACHIEVEMENT_BADGES_CATALOG, unlockedIds),
    [unlockedIds],
  );

  const pad = 20;
  const colGap = 12;
  const cols = 3;
  const colW = Math.floor((windowWidth - pad * 2 - colGap * (cols - 1)) / cols);

  function openSheet(badge: AchievementBadgeDefinition, isUnlocked: boolean) {
    setSheet({ badge, unlocked: isUnlocked });
    setSheetOpen(true);
  }

  function renderGrid(defs: AchievementBadgeDefinition[]) {
    return (
      <View style={styles.grid}>
        {defs.map((b) => {
          const u = unlockedIds.has(b.id);
          return (
            <View key={b.id} style={{ width: colW }}>
              <AchievementBadge
                icon={b.icon}
                tint={b.tint}
                label={b.label}
                size="sm"
                unlocked={u}
                onPress={() => openSheet(b, u)}
              />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) + 8, paddingTop: 8 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>All badges</Text>
        <Text style={styles.subtitle}>Tap a badge to see how it works or what you earned.</Text>

        {unlocked.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unlocked</Text>
            {renderGrid(unlocked)}
          </View>
        ) : null}

        <View style={[styles.section, unlocked.length === 0 && styles.sectionFirst]}>
          <Text style={styles.sectionTitle}>{unlocked.length > 0 ? "Locked" : "Badges"}</Text>
          {unlocked.length === 0 ? (
            <Text style={styles.sectionMeta}>
              Play Wolf, Skins, and rounds with friends — badges unlock as you go.
            </Text>
          ) : null}
          {renderGrid(locked)}
        </View>
      </ScrollView>

      <AchievementBadgeDetailSheet
        visible={sheetOpen}
        badge={sheet?.badge ?? null}
        unlocked={sheet?.unlocked ?? false}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 28,
  },
  section: {
    marginBottom: 28,
  },
  sectionFirst: {
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  sectionMeta: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 20,
    marginTop: -6,
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 20,
  },
});
