import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BadgeHexFrame, badgeHexHeight } from "./badge-hex-frame";
import { colors } from "../lib/theme";

/** Muted hex for badges not yet earned. */
export const BADGE_LOCKED_PALETTE = {
  bg: "#d8d6d1",
  ring: "#9c9890",
  icon: "#6e6a63",
} as const;

export const BADGE_TINTS = {
  gold: { bg: "#f4e4bc", ring: "#c9a227", icon: "#6b5900" },
  silver: { bg: "#e8eaed", ring: "#9aa0a6", icon: "#3c4043" },
  bronze: { bg: "#edd8c8", ring: "#a67c52", icon: "#5c3d1e" },
  fairway: { bg: "#e3efe6", ring: "#1a3c2a", icon: "#1a3c2a" },
  sky: { bg: "#e3eef9", ring: "#3d6fb8", icon: "#2a4d82" },
  sunset: { bg: "#fde8e0", ring: "#d97b5c", icon: "#a34a2f" },
  grape: { bg: "#eee8f4", ring: "#7c5aa6", icon: "#4f3a6e" },
  ember: { bg: "#fce8e6", ring: "#c5221f", icon: "#8b1a18" },
  midnight: { bg: "#e8ecf2", ring: "#2c3e50", icon: "#1a252f" },
  mustard: { bg: "#faf3d4", ring: colors.mustard, icon: "#6b5a12" },
} as const;

export type BadgeTint = keyof typeof BADGE_TINTS;

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const SIZES = {
  sm: { hexW: 44, icon: 19, label: 10, gap: 5 },
  md: { hexW: 54, icon: 24, label: 11, gap: 6 },
  lg: { hexW: 76, icon: 34, label: 12, gap: 8 },
} as const;

export type AchievementBadgeSize = keyof typeof SIZES;

export type BadgeShape = "hex" | "circle";

export type AchievementBadgeProps = {
  icon: IoniconName;
  tint: BadgeTint;
  label?: string;
  size?: AchievementBadgeSize;
  accessibilityLabel?: string;
  onPress?: () => void;
  /** When false, badge is greyed out (still tappable if `onPress` is set). Default true. */
  unlocked?: boolean;
  /** NYT-style hex patch vs legacy circle. */
  shape?: BadgeShape;
};

export function AchievementBadge({
  icon,
  tint,
  label,
  size = "md",
  accessibilityLabel,
  onPress,
  unlocked = true,
  shape = "hex",
}: AchievementBadgeProps) {
  const palette = unlocked ? BADGE_TINTS[tint] : BADGE_LOCKED_PALETTE;
  const s = SIZES[size];
  const a11y =
    accessibilityLabel ??
    (label
      ? `${label} badge${unlocked ? "" : ", locked"}`
      : unlocked
        ? "Achievement badge"
        : "Locked achievement badge");

  const inner =
    shape === "hex" ? (
      <HexBadgeBody
        icon={icon}
        iconSize={s.icon}
        hexWidth={s.hexW}
        palette={palette}
        unlocked={unlocked}
      />
    ) : (
      <CircleBadgeBody
        icon={icon}
        iconSize={s.icon}
        ringSize={s.hexW}
        palette={palette}
        unlocked={unlocked}
      />
    );

  const wrapW =
    shape === "hex" ? Math.max(s.hexW + 4, 56) : Math.max(s.hexW + 8, 56);
  const hexH = shape === "hex" ? badgeHexHeight(s.hexW) : s.hexW;

  const labelEl =
    label != null ? (
      <Text
        style={[
          styles.label,
          { fontSize: s.label, maxWidth: wrapW + 8 },
          !unlocked && styles.labelLocked,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    ) : null;

  const wrapStyle = [
    styles.wrap,
    {
      width: wrapW,
      gap: s.gap,
      minHeight: (shape === "hex" ? hexH : s.hexW) + (label ? 22 : 0),
    },
    !unlocked && styles.wrapLocked,
  ];

  const content = (
    <>
      {inner}
      {labelEl}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [wrapStyle, pressed && styles.wrapPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={unlocked ? "Shows what you earned" : "Shows how to unlock this badge"}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={wrapStyle} accessibilityRole="text" accessibilityLabel={a11y}>
      {content}
    </View>
  );
}

function HexBadgeBody({
  icon,
  iconSize,
  hexWidth,
  palette,
  unlocked,
}: {
  icon: IoniconName;
  iconSize: number;
  hexWidth: number;
  palette: { bg: string; ring: string; icon: string };
  unlocked: boolean;
}) {
  return (
    <View style={styles.hexWrap}>
      <BadgeHexFrame width={hexWidth} fill={palette.bg} stroke={palette.ring} strokeWidth={unlocked ? 2.85 : 2.2}>
        <Ionicons name={icon} size={iconSize} color={palette.icon} />
      </BadgeHexFrame>
      {!unlocked ? (
        <View style={styles.hexLockPill}>
          <Ionicons name="lock-closed" size={11} color={colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

function CircleBadgeBody({
  icon,
  iconSize,
  ringSize,
  palette,
  unlocked,
}: {
  icon: IoniconName;
  iconSize: number;
  ringSize: number;
  palette: { bg: string; ring: string; icon: string };
  unlocked: boolean;
}) {
  return (
    <View
      style={[
        styles.ring,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          backgroundColor: palette.bg,
          borderColor: palette.ring,
          opacity: unlocked ? 1 : 0.92,
        },
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={palette.icon} />
      {!unlocked ? (
        <View
          style={[
            styles.lockChip,
            {
              width: Math.round(ringSize * 0.36),
              height: Math.round(ringSize * 0.36),
              borderRadius: Math.round(ringSize * 0.18),
              right: -2,
              bottom: -2,
            },
          ]}
        >
          <Ionicons name="lock-closed" size={Math.max(11, Math.round(iconSize * 0.42))} color={colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

type BadgesRowProps = {
  children: ReactNode;
  style?: object;
};

export function AchievementBadgesRow({ children, style }: BadgesRowProps) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  wrapPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  hexWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 10,
  },
  hexLockPill: {
    position: "absolute",
    bottom: -4,
    alignSelf: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.1)",
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  lockChip: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  label: {
    color: colors.muted,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
  labelLocked: {
    color: "#9e9a94",
    fontWeight: "600",
  },
  wrapLocked: {
    opacity: 0.94,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    rowGap: 16,
  },
});
