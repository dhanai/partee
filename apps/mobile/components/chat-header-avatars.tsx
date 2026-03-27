import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";
import { InitialAvatar } from "./initial-avatar";

type Props = {
  type: "dm" | "round" | "group" | string;
  title: string;
  avatars: string[];
  loading?: boolean;
  onInfoPress?: () => void;
};

const SIZE = 30;
const OVERLAP = 10;

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function SingleAvatar({ uri }: { uri: string }) {
  return (
    <Image
      source={toAbsoluteUrl(uri)}
      style={styles.single}
      contentFit="cover"
      transition={0}
    />
  );
}

function OverlappedCluster({ avatars }: { avatars: string[] }) {
  const count = Math.min(avatars.length, 4);
  const totalWidth = SIZE + (count - 1) * (SIZE - OVERLAP);

  return (
    <View style={[styles.clusterWrap, { width: totalWidth }]}>
      {avatars.slice(0, 4).map((uri, i) => (
        <Image
          key={`header-av-${i}`}
          source={toAbsoluteUrl(uri)}
          style={[
            styles.clusterAvatar,
            {
              left: i * (SIZE - OVERLAP),
              zIndex: count - i,
            },
          ]}
          contentFit="cover"
          transition={0}
        />
      ))}
    </View>
  );
}

function Placeholder({ type, title }: { type: string; title: string }) {
  return <InitialAvatar name={title || (type === "dm" ? "?" : "G")} size={32} />;
}

function HeaderSkeleton() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <View style={styles.headerCol}>
      <Animated.View style={[styles.skeletonCircle, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonBar, { opacity: pulse }]} />
    </View>
  );
}

export function ChatHeaderAvatars({ type, title, avatars, loading }: Props) {
  if (loading) return <HeaderSkeleton />;

  const displayTitle = type === "dm" ? abbreviateName(title) : title;

  const avatarElement =
    avatars.length === 0 ? (
      <Placeholder type={type} title={title} />
    ) : avatars.length === 1 ? (
      <SingleAvatar uri={avatars[0]} />
    ) : (
      <OverlappedCluster avatars={avatars} />
    );

  return (
    <View style={styles.headerCol}>
      {avatarElement}
      {displayTitle ? (
        <Text style={styles.headerLabel} numberOfLines={1}>
          {displayTitle}
        </Text>
      ) : null}
    </View>
  );
}

export function ChatHeaderInfoButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.infoBtn}>
      <Ionicons name="information-circle-outline" size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerCol: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    maxWidth: 220,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  clusterWrap: {
    height: SIZE,
    position: "relative",
  },
  clusterAvatar: {
    position: "absolute",
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: colors.background,
  },
  single: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  placeholder: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.border,
  },
  skeletonBar: {
    width: 70,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    marginTop: 2,
  },
});
