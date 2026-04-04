import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toAbsoluteUrl } from "../lib/api";
import { ensureMediaLibraryPermissionForSave } from "../lib/media-library-permission";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Props = {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[zoomStyles.container, animatedStyle]}>
        <Image
          source={toAbsoluteUrl(uri)}
          style={zoomStyles.image}
          contentFit="contain"
          transition={200}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const zoomStyles = StyleSheet.create({
  container: { width: SCREEN_W, height: SCREEN_H, justifyContent: "center", alignItems: "center" },
  image: { width: SCREEN_W, height: SCREEN_H * 0.75 },
});

export const FullscreenImageViewer = memo(function FullscreenImageViewer({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  const bgOpacity = useSharedValue(1);
  const dismissY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      bgOpacity.value = 1;
      dismissY.value = 0;
      setCurrentIndex(initialIndex);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible, initialIndex, bgOpacity, dismissY]);

  const dismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const swipeToDismiss = Gesture.Pan()
    .minPointers(1)
    .activeOffsetY([-20, 20])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      dismissY.value = e.translationY;
      const progress = Math.min(1, Math.abs(e.translationY) / 300);
      bgOpacity.value = 1 - progress * 0.6;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 120) {
        const exitY = e.translationY > 0 ? SCREEN_H : -SCREEN_H;
        dismissY.value = withTiming(exitY, { duration: 200 });
        bgOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(dismiss)();
      } else {
        dismissY.value = withTiming(0, { duration: 200 });
        bgOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${bgOpacity.value})`,
  }));

  const galleryTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const handleViewableChange = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const handleSave = useCallback(async () => {
    try {
      const ok = await ensureMediaLibraryPermissionForSave({
        title: "Permission required",
        message: "Photo library access is needed to save images.",
      });
      if (!ok) return;
      const uri = toAbsoluteUrl(images[currentIndex]);
      const fileUri = `${FileSystem.cacheDirectory}partee-save-${Date.now()}.jpg`;
      await FileSystem.downloadAsync(uri, fileUri);
      await MediaLibrary.saveToLibraryAsync(fileUri);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Saved", "Image saved to your photo library.");
    } catch {
      Alert.alert("Error", "Could not save image.");
    }
  }, [images, currentIndex]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ url: toAbsoluteUrl(images[currentIndex]) });
    } catch {
      /* user cancelled */
    }
  }, [images, currentIndex]);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ZoomableImage uri={item} />
    ),
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Animated.View style={[viewerStyles.root, bgStyle]}>
        {/* Header */}
        <View style={[viewerStyles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={viewerStyles.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View style={viewerStyles.headerSpacer} />
          <Pressable onPress={handleShare} hitSlop={12} style={viewerStyles.headerBtn}>
            <Ionicons name="share-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Gallery — wrapped in swipe-to-dismiss gesture + animated translateY */}
        <GestureDetector gesture={swipeToDismiss}>
          <Animated.View style={[viewerStyles.gallery, galleryTranslateStyle]}>
            <FlatList
              ref={flatListRef}
              data={images}
              renderItem={renderItem}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
              onViewableItemsChanged={handleViewableChange}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            />
          </Animated.View>
        </GestureDetector>

        {/* Footer */}
        <View style={[viewerStyles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {images.length > 1 ? (
            <Text style={viewerStyles.pageText}>
              {currentIndex + 1} / {images.length}
            </Text>
          ) : null}
          <Pressable onPress={handleSave} hitSlop={12} style={viewerStyles.saveBtn}>
            <Ionicons name="download-outline" size={22} color="#fff" />
            <Text style={viewerStyles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
});

const viewerStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,1)",
  },
  gallery: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  pageText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
