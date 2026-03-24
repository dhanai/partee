import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HousePromoSlotClient } from "../lib/house-promo-api";
import { colors } from "../lib/theme";

type Props = {
  visible: boolean;
  slot: HousePromoSlotClient;
  onDismiss: () => void;
};

function FullscreenPromoVideo({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.volume = 1;
  });
  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);
  return (
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
  );
}

export function GameEndHousePromoModal({ visible, slot, onDismiss }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const url = slot.targetUrl?.trim() ?? "";
  const mediaUri = slot.mediaUrl?.trim() ?? "";
  const title = slot.title?.trim() || "";
  const cta = slot.ctaLabel?.trim() || "Learn more";

  const openTarget = useCallback(() => {
    if (!url) return;
    void Linking.openURL(url);
  }, [url]);

  const swipeRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -56) openTarget();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onDismiss}>
      <View style={[styles.root, { width, height }]}>
        <View style={StyleSheet.absoluteFill} {...swipeRef.panHandlers}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={openTarget}
            accessibilityRole="button"
            accessibilityLabel={`Open sponsor link: ${title}`}
          >
            {slot.mediaKind === "video" && mediaUri ? (
              <FullscreenPromoVideo uri={mediaUri} active={visible} />
            ) : mediaUri ? (
              <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />
            )}
          </Pressable>
        </View>

        <View
          style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.closeBtn}
            onPress={onDismiss}
            accessibilityLabel="Close promo"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        <View
          style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
          pointerEvents="box-none"
        >
          <View style={styles.swipeHint} pointerEvents="none">
            <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.85)" />
            <Text style={styles.swipeHintText}>Swipe up for more</Text>
          </View>
          {title ? (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {slot.subtitle?.trim() ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {slot.subtitle.trim()}
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={openTarget}
            accessibilityRole="link"
            accessibilityLabel={cta}
          >
            <Text style={styles.ctaText}>{cta}</Text>
            <Ionicons name="open-outline" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onDismiss} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#000",
  },
  fallbackBg: {
    backgroundColor: "#1a1a1a",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    zIndex: 2,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 2,
  },
  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 14,
  },
  swipeHintText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: colors.fairway,
    marginBottom: 12,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  skip: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "600",
  },
});
