import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { ProfileCategoryStatsBlock, ProfileStatCategoryId } from "../lib/profile-stats-api";
import { PROFILE_STAT_LABELS, PROFILE_STAT_THEMES } from "../lib/profile-stat-themes";
import { colors } from "../lib/theme";

export type ProfileStatHeroStackPosition = "first" | "middle" | "last";

type Props = {
  category: ProfileStatCategoryId;
  block: ProfileCategoryStatsBlock;
  /** Stacked strip on profile (shared borders/radius). */
  variant: "stack";
  stackPosition: ProfileStatHeroStackPosition;
  style?: ViewStyle;
};

type FloatingProps = {
  category: ProfileStatCategoryId;
  block: ProfileCategoryStatsBlock;
  /** Detail screen: full rounded card + shadow. */
  variant: "floating";
  stackPosition?: undefined;
  style?: ViewStyle;
};

/**
 * Same chrome as the profile stat strip cards (NYT-style header + highlight columns).
 */
export function ProfileStatHeroCard(props: Props | FloatingProps) {
  const { category, block, variant, style } = props;
  const t = PROFILE_STAT_THEMES[category];
  const title = PROFILE_STAT_LABELS[category];
  const highlights = block.highlights ?? [];

  const stackRadius = 22;
  const hairline = StyleSheet.hairlineWidth * 2;

  const stackFrame: ViewStyle =
    variant === "stack"
      ? (() => {
          const isFirst = props.stackPosition === "first";
          const isLast = props.stackPosition === "last";
          return {
            backgroundColor: t.bg,
            borderLeftColor: t.border,
            borderRightColor: t.border,
            borderLeftWidth: hairline,
            borderRightWidth: hairline,
            borderTopWidth: isFirst ? hairline : 0,
            borderTopColor: t.border,
            borderBottomWidth: isLast ? hairline : StyleSheet.hairlineWidth,
            borderBottomColor: isLast ? t.border : "rgba(0,0,0,0.1)",
            borderTopLeftRadius: isFirst ? stackRadius : 0,
            borderTopRightRadius: isFirst ? stackRadius : 0,
            borderBottomLeftRadius: isLast ? stackRadius : 0,
            borderBottomRightRadius: isLast ? stackRadius : 0,
          };
        })()
      : {
          backgroundColor: t.bg,
          borderRadius: stackRadius,
          borderWidth: hairline,
          borderColor: t.border,
          shadowColor: "#2a2419",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.07,
          shadowRadius: 16,
          elevation: 4,
        };

  return (
    <View style={[variant === "stack" && props.stackPosition !== "first" && styles.stackOverlap, stackFrame, styles.inner, style]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: t.accent }]}>{title}</Text>
        <View style={[styles.iconBubble, { backgroundColor: "rgba(255,255,255,0.65)" }]}>
          <Ionicons name={t.icon} size={22} color={t.accent} />
        </View>
      </View>

      <View style={[styles.highlightDivider, { backgroundColor: "rgba(0,0,0,0.08)" }]} />

      <View style={styles.highlightRow}>
        {highlights.map((h) => (
          <View key={h.label} style={styles.highlightCell}>
            <Text
              style={styles.highlightValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {h.value}
            </Text>
            <Text style={styles.highlightLabel} numberOfLines={2}>
              {h.label.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  stackOverlap: {
    marginTop: -StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    flex: 1,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    marginBottom: 12,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  highlightCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  highlightValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
    width: "100%",
  },
  highlightLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.35,
    textAlign: "center",
    lineHeight: 12,
  },
});
