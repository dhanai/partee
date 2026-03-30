import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

const MAP_HEIGHT = 208;

type Props = {
  visible: boolean;
  onClose: () => void;
  courseName: string;
  courseAddress: string | null | undefined;
  courseLatitude: number | null | undefined;
  courseLongitude: number | null | undefined;
};

function buildCopyText(
  courseName: string,
  courseAddress: string | null | undefined,
  lat: number | null,
  lng: number | null,
): string {
  const addr = courseAddress?.trim();
  if (addr) return addr;
  if (lat != null && lng != null) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
  return courseName.trim() || "Location";
}

function openDirections(
  courseName: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  address: string | null | undefined,
) {
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng);

  if (hasCoords) {
    if (Platform.OS === "ios") {
      // `q=` with a venue name is treated as an address search and often shows "Invalid address".
      // `daddr` with coordinates opens directions to that point.
      void Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}`);
      return;
    }
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    );
    return;
  }

  const q = (address?.trim() || courseName.trim()) || "golf course";
  void Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
  );
}

export function RoundCourseLocationSheet({
  visible,
  onClose,
  courseName,
  courseAddress,
  courseLatitude,
  courseLongitude,
}: Props) {
  const insets = useSafeAreaInsets();

  const lat =
    typeof courseLatitude === "number" && !Number.isNaN(courseLatitude)
      ? courseLatitude
      : null;
  const lng =
    typeof courseLongitude === "number" && !Number.isNaN(courseLongitude)
      ? courseLongitude
      : null;

  /** Same satellite preview as round hero when coords exist — no native maps module required. */
  const mapPreviewUri = useMemo(() => {
    if (lat == null || lng == null) return null;
    return toAbsoluteUrl(
      `/api/images/course-satellite?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
    );
  }, [lat, lng]);

  const copyText = useMemo(
    () => buildCopyText(courseName, courseAddress, lat, lng),
    [courseName, courseAddress, lat, lng],
  );

  const copyButtonLabel = useMemo(() => {
    if (courseAddress?.trim()) return "Copy address";
    if (lat != null && lng != null) return "Copy coordinates";
    return "Copy location";
  }, [courseAddress, lat, lng]);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(copyText);
  }, [copyText]);

  const handleDirections = useCallback(() => {
    openDirections(courseName, lat, lng, courseAddress);
  }, [courseName, lat, lng, courseAddress]);

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      snapPoints={["58%"]}
      enableContentPanningGesture={false}
      sheetStyle={{ paddingHorizontal: 20, paddingTop: 4 }}
    >
      <Text style={styles.sheetTitle} numberOfLines={2}>
        {courseName}
      </Text>
      {courseAddress?.trim() ? (
        <Text style={styles.sheetAddress} numberOfLines={3}>
          {courseAddress.trim()}
        </Text>
      ) : null}

      {mapPreviewUri ? (
        <View style={styles.mapWrap}>
          <Image
            source={{ uri: mapPreviewUri }}
            style={styles.mapImage}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`Map preview near ${courseName}`}
          />
        </View>
      ) : (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={40} color={colors.muted} />
          <Text style={styles.fallbackText}>
            Map preview needs coordinates from the course listing. You can still copy the address or open
            directions.
          </Text>
        </View>
      )}

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          onPress={() => void handleCopy()}
        >
          <Ionicons name="copy-outline" size={20} color={colors.fairway} />
          <Text style={styles.secondaryBtnText}>{copyButtonLabel}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={handleDirections}
        >
          <Ionicons name="navigate-outline" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Get directions</Text>
        </Pressable>
      </View>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  sheetAddress: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 20,
  },
  mapWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  mapImage: {
    width: "100%",
    height: MAP_HEIGHT,
    backgroundColor: colors.fairwaySoft,
  },
  mapFallback: {
    minHeight: MAP_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  fallbackText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.fairway,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.fairway,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  pressed: {
    opacity: 0.88,
  },
});
