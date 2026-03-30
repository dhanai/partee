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
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { hapticSuccess } from "../lib/haptics";
import { useSnackbar } from "../lib/snackbar-context";
import { colors } from "../lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  courseName: string;
  courseAddress: string | null | undefined;
  courseLatitude: number | null | undefined;
  courseLongitude: number | null | undefined;
};

/** API may serialize lat/lng as strings; match server-side parseCoord. */
function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

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
  const { show: showSnackbar } = useSnackbar();

  const lat = parseCoord(courseLatitude);
  const lng = parseCoord(courseLongitude);

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
    hapticSuccess();
    if (courseAddress?.trim()) {
      showSnackbar("Address copied");
    } else if (lat != null && lng != null) {
      showSnackbar("Coordinates copied");
    } else {
      showSnackbar("Location copied");
    }
  }, [copyText, courseAddress, lat, lng, showSnackbar]);

  const handleDirections = useCallback(() => {
    openDirections(courseName, lat, lng, courseAddress);
  }, [courseName, lat, lng, courseAddress]);

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      enableContentPanningGesture={false}
      sheetStyle={{ paddingHorizontal: 20, paddingTop: 4 }}
    >
      <Text
        style={[styles.sheetTitle, !courseAddress?.trim() && styles.sheetTitleSolo]}
        numberOfLines={2}
      >
        {courseName}
      </Text>
      {courseAddress?.trim() ? (
        <Text style={styles.sheetAddress} numberOfLines={4}>
          {courseAddress.trim()}
        </Text>
      ) : null}

      <View style={styles.actions}>
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
  /** Extra space before actions when there is no address line. */
  sheetTitleSolo: {
    marginBottom: 18,
  },
  sheetAddress: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 20,
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
