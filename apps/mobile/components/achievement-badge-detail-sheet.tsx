import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedBottomSheetFrame, BottomSheetScrollView } from "./animated-bottom-sheet-frame";
import {
  BADGE_LOCKED_PALETTE,
  BADGE_TINTS,
  type AchievementBadgeProps,
} from "./achievement-badge";
import { BadgeHexFrame, badgeHexHeight } from "./badge-hex-frame";
import { colors } from "../lib/theme";

export type BadgeSheetCategory = "wolf" | "skins" | "social";

export type AchievementBadgeDefinition = AchievementBadgeProps & {
  id: string;
  detailTitle: string;
  category: BadgeSheetCategory;
  /** Shown when the badge is still locked — how to earn it. */
  howToUnlock: string;
  /** Shown when unlocked — what you achieved. */
  detailBodyEarned: string;
};

/** @deprecated Use AchievementBadgeDefinition */
export type AchievementBadgeDetail = AchievementBadgeDefinition;

const CATEGORY_LABEL: Record<BadgeSheetCategory, string> = {
  wolf: "Wolf",
  skins: "Skins",
  social: "Parfade",
};

const CATEGORY_STYLES: Record<
  BadgeSheetCategory,
  { bg: string; text: string; border: string }
> = {
  wolf: { bg: colors.fairwaySoft, text: colors.fairway, border: "#c5dccf" },
  skins: { bg: "#fde8e0", text: "#a34a2f", border: "#f0cfc0" },
  social: { bg: "#e3eef9", text: "#2a4d82", border: "#c8d8ec" },
};

type Props = {
  visible: boolean;
  onClose: () => void;
  badge: AchievementBadgeDefinition | null;
  unlocked: boolean;
};

const HERO_HEX_W = 108;
/** Match horizontal hero padding so the close control isn’t tighter to the top than the trailing edge. */
const HERO_EDGE_INSET = 20;

function HeroBadgeHex({
  icon,
  tint,
  unlocked,
}: Pick<AchievementBadgeProps, "icon" | "tint"> & { unlocked: boolean }) {
  const p = unlocked ? BADGE_TINTS[tint] : BADGE_LOCKED_PALETTE;
  const iconSize = 40;
  const hexH = badgeHexHeight(HERO_HEX_W);
  return (
    <View style={[styles.heroHexStage, { height: hexH + 10 }]}>
      {unlocked ? (
        <View style={styles.heroGlowPack} pointerEvents="none">
          <View style={[styles.heroGlowOrb, { width: 132, height: 132, opacity: 0.18 }]} />
          <View style={[styles.heroGlowOrb, { width: 118, height: 118, opacity: 0.14 }]} />
          <View style={[styles.heroGlowOrb, { width: 104, height: 104, opacity: 0.1 }]} />
        </View>
      ) : null}
      <View style={styles.heroHexLift}>
        <BadgeHexFrame
          width={HERO_HEX_W}
          fill={p.bg}
          stroke={p.ring}
          strokeWidth={unlocked ? 3.1 : 2.4}
        >
          <Ionicons name={icon} size={iconSize} color={p.icon} />
        </BadgeHexFrame>
        {!unlocked ? (
          <View style={styles.heroHexLockPill}>
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const BADGE_SNAP_POINTS = ["88%"] as const;

export function AchievementBadgeDetailSheet({ visible, onClose, badge, unlocked }: Props) {
  const cat = badge?.category ?? "social";
  const catStyle = CATEGORY_STYLES[cat];
  const insets = useSafeAreaInsets();

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel="Dismiss achievement details"
      snapPoints={BADGE_SNAP_POINTS}
      sheetStyle={styles.sheetContent}
      backgroundStyle={styles.sheetBackground}
    >
      {badge ? (
        <>
          <View style={[styles.hero, !unlocked && styles.heroLocked]}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroEyebrow}>{unlocked ? "Unlocked" : "Locked"}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => [styles.heroCloseBtn, pressed && styles.heroCloseBtnPressed]}
              >
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.95)" />
              </Pressable>
            </View>
            <View style={styles.heroBadgeWrap}>
              <View style={styles.heroBadgeLift}>
                <HeroBadgeHex icon={badge.icon} tint={badge.tint} unlocked={unlocked} />
              </View>
            </View>
            <Text style={styles.heroTitle}>{badge.detailTitle}</Text>
            <View style={[styles.categoryPill, { backgroundColor: catStyle.bg, borderColor: catStyle.border }]}>
              <Text style={[styles.categoryPillText, { color: catStyle.text }]}>
                {CATEGORY_LABEL[cat]}
              </Text>
            </View>
          </View>

          <BottomSheetScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.detailCard}>
              {!unlocked ? (
                <>
                  <Text style={[styles.detailCardEyebrow, styles.detailCardEyebrowLocked]}>
                    How to unlock
                  </Text>
                  <Text style={styles.detailBody}>{badge.howToUnlock}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.detailCardEyebrow}>You earned this</Text>
                  <Text style={styles.detailBody}>{badge.detailBodyEarned}</Text>
                </>
              )}
            </View>
            <Text style={styles.footerNote}>
              {unlocked
                ? "Keep playing side games to collect more badges."
                : "Complete games and meet the criteria above — we’ll light this one up when you do."}
            </Text>
          </BottomSheetScrollView>

          <View style={[styles.footerActions, { paddingBottom: Math.max(insets.bottom, 6) }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    overflow: "hidden",
  },
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  hero: {
    backgroundColor: colors.fairway,
    paddingBottom: 24,
    paddingHorizontal: HERO_EDGE_INSET,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  heroLocked: {
    backgroundColor: "#3d4f5c",
    shadowOpacity: 0.12,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    paddingTop: HERO_EDGE_INSET,
    paddingBottom: 2,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.62)",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  heroCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  heroCloseBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  heroBadgeWrap: {
    alignItems: "center",
    marginTop: 4,
  },
  heroBadgeLift: {
    marginBottom: 6,
  },
  heroHexStage: {
    width: 148,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlowPack: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlowOrb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  heroHexLift: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  heroHexLockPill: {
    position: "absolute",
    bottom: -6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  heroTitle: {
    marginTop: 14,
    fontSize: 27,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
    paddingHorizontal: 8,
  },
  categoryPill: {
    alignSelf: "center",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyScrollContent: {
    paddingHorizontal: HERO_EDGE_INSET,
    paddingTop: 22,
    paddingBottom: 10,
  },
  detailCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
    shadowColor: "#2a2419",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  detailCardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.fairway,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  detailCardEyebrowLocked: {
    color: "#5a6b78",
  },
  detailBody: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
    lineHeight: 25,
    letterSpacing: -0.15,
  },
  footerNote: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  footerActions: {
    paddingHorizontal: HERO_EDGE_INSET,
    paddingTop: 14,
    paddingBottom: 6,
  },
  doneBtn: {
    paddingVertical: 15,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.fairway,
  },
  doneBtnPressed: {
    opacity: 0.92,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
