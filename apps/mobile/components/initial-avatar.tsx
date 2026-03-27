import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { userAvatarCornerRadius } from "../lib/user-avatar-display";

const PALETTE = [
  "#4A7C59", // sage
  "#6B4C9A", // plum
  "#C46D3B", // terracotta
  "#3B7DB5", // steel blue
  "#8B5E3C", // walnut
  "#2D8659", // emerald
  "#A85C8E", // mauve
  "#5B7FA5", // slate
  "#B5703B", // amber
  "#3D7A6B", // teal
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name: string, maxChars: 1 | 2 = 1): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (maxChars === 1) return trimmed.charAt(0).toUpperCase();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

type Props = {
  name: string;
  size: number;
  /** Show 1 or 2 initials. Default 1. */
  maxInitials?: 1 | 2;
  /** Override border radius. Default is fully round (size / 2). */
  borderRadius?: number;
};

export const InitialAvatar = memo(function InitialAvatar({
  name,
  size,
  maxInitials = 1,
  borderRadius,
}: Props) {
  const bg = colorForName(name);
  const fontSize = maxInitials === 2 ? size * 0.36 : size * 0.44;

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: borderRadius ?? userAvatarCornerRadius(size),
          backgroundColor: bg,
        },
      ]}
    >
      <Text
        style={[
          styles.initial,
          { fontSize, lineHeight: fontSize * 1.15 },
        ]}
      >
        {getInitials(name, maxInitials)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 1,
  },
  initial: {
    color: "#fff",
    fontWeight: "700",
  },
});
