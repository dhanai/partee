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
  avatarUserIds?: (string | null)[];
  onlineUserIds?: Set<string>;
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

const DOT_SIZE = 8;

function OnlineDotOverlay() {
  return <View style={styles.onlineDot} />;
}

function SingleAvatar({ uri, online }: { uri: string; online?: boolean }) {
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Image
        source={toAbsoluteUrl(uri)}
        style={styles.single}
        contentFit="cover"
        transition={0}
      />
      {online ? <OnlineDotOverlay /> : null}
    </View>
  );
}

function OverlappedCluster({
  avatars,
  userIds,
  onlineUserIds,
}: {
  avatars: string[];
  userIds?: (string | null)[];
  onlineUserIds?: Set<string>;
}) {
  const count = Math.min(avatars.length, 4);
  const totalWidth = SIZE + (count - 1) * (SIZE - OVERLAP);

  return (
    <View style={[styles.clusterWrap, { width: totalWidth }]}>
      {avatars.slice(0, 4).map((uri, i) => {
        const uid = userIds?.[i];
        const isOnline = uid ? onlineUserIds?.has(uid) : false;
        return (
          <View
            key={`header-av-${i}`}
            style={{
              position: "absolute",
              left: i * (SIZE - OVERLAP),
              zIndex: count - i,
              width: SIZE,
              height: SIZE,
            }}
          >
            <Image
              source={toAbsoluteUrl(uri)}
              style={styles.clusterAvatar}
              contentFit="cover"
              transition={0}
            />
            {isOnline ? <OnlineDotOverlay /> : null}
          </View>
        );
      })}
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

export function ChatHeaderAvatars({ type, title, avatars, loading, avatarUserIds, onlineUserIds }: Props) {
  if (loading) return <HeaderSkeleton />;

  const displayTitle = type === "dm" ? abbreviateName(title) : title;

  const singleOnline = (() => {
    if (!onlineUserIds || !avatarUserIds) return false;
    const uid = avatarUserIds[0];
    return uid ? onlineUserIds.has(uid) : false;
  })();

  const avatarElement =
    avatars.length === 0 ? (
      <Placeholder type={type} title={title} />
    ) : avatars.length === 1 ? (
      <SingleAvatar uri={avatars[0]} online={singleOnline} />
    ) : (
      <OverlappedCluster avatars={avatars} userIds={avatarUserIds} onlineUserIds={onlineUserIds} />
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
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#34C759",
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
