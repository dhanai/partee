import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { ensureMediaLibraryPermissionForPicker } from "../../lib/media-library-permission";
import { colors } from "../../lib/theme";

export default function PostScoreScreen() {
  const router = useRouter();
  const [scorecardUri, setScorecardUri] = useState<string | null>(null);

  async function pickScorecard() {
    const ok = await ensureMediaLibraryPermissionForPicker({
      title: "Permission required",
      message: "Photo library access is needed to upload a scorecard.",
    });
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setScorecardUri(result.assets[0].uri);
    }
  }

  function handleManualEntry() {
    Alert.alert("Coming next", "Manual score entry will be connected in the next step.");
  }

  function handleContinue() {
    Alert.alert("OCR review next", "Scorecard parsing + review flow is the next implementation step.");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Post score</Text>
      <Text style={styles.sub}>
        Upload a scorecard photo or start manual entry. You will review scores before posting.
      </Text>

      <Pressable style={styles.optionCard} onPress={() => void pickScorecard()}>
        <View style={styles.optionIconWrap}>
          <Ionicons name="camera-outline" size={18} color={colors.fairway} />
        </View>
        <View style={styles.optionTextWrap}>
          <Text style={styles.optionTitle}>Upload scorecard photo</Text>
          <Text style={styles.optionBody}>Use a physical or digital scorecard image.</Text>
        </View>
      </Pressable>

      <Pressable style={styles.optionCard} onPress={handleManualEntry}>
        <View style={styles.optionIconWrap}>
          <Ionicons name="create-outline" size={18} color={colors.fairway} />
        </View>
        <View style={styles.optionTextWrap}>
          <Text style={styles.optionTitle}>Enter scores manually</Text>
          <Text style={styles.optionBody}>Hole-by-hole entry flow.</Text>
        </View>
      </Pressable>

      {scorecardUri ? (
        <View style={styles.previewWrap}>
          <Text style={styles.previewLabel}>Selected scorecard</Text>
          <Image source={scorecardUri} style={styles.previewImage} transition={0} />
          <Pressable style={styles.secondaryBtn} onPress={() => setScorecardUri(null)}>
            <Text style={styles.secondaryBtnText}>Remove photo</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        style={[styles.primaryBtn, !scorecardUri && styles.primaryBtnDisabled]}
        onPress={handleContinue}
        disabled={!scorecardUri}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
      </Pressable>

      <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, lineHeight: 20 },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#faf8f5",
    padding: 10,
  },
  optionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontWeight: "700" },
  optionBody: { color: colors.muted, fontSize: 12 },
  previewWrap: {
    marginTop: 4,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  previewLabel: { color: colors.muted, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
  },
  secondaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#ece8e1",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { color: colors.text, fontWeight: "700" },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelBtnText: { color: colors.muted, fontWeight: "600" },
});
