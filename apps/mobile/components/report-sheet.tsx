import { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { apiPost } from "../lib/api";
import { hapticSuccess } from "../lib/haptics";
import { colors } from "../lib/theme";

type ReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  contentType: "user" | "post" | "comment" | "message";
  contentId: string;
  targetUserId?: string;
  /** Display label, e.g. "this user" or "this post" */
  targetLabel?: string;
};

const REASONS = [
  "Spam or scam",
  "Harassment or bullying",
  "Inappropriate content",
  "Hate speech",
  "Impersonation",
  "Other",
] as const;

export function ReportSheet({
  visible,
  onClose,
  contentType,
  contentId,
  targetUserId,
  targetLabel,
}: ReportSheetProps) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setSelectedReason(null);
    setOtherText("");
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit() {
    const reason =
      selectedReason === "Other" ? otherText.trim() : selectedReason;
    if (!reason) return;
    setSubmitting(true);
    try {
      const token = await getTokenRef.current();
      await apiPost(
        "/api/reports",
        {
          contentType,
          contentId,
          reason,
          ...(targetUserId ? { targetUserId } : {}),
        },
        token,
      );
      hapticSuccess();
      handleClose();
      Alert.alert(
        "Report submitted",
        `Thank you for reporting ${targetLabel ?? "this content"}. We'll review it shortly.`,
      );
    } catch {
      Alert.alert("Error", "Unable to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    selectedReason !== null &&
    (selectedReason !== "Other" || otherText.trim().length > 0);

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={handleClose}
      sheetStyle={styles.sheet}
    >
      <Text style={styles.title}>
        Report {targetLabel ?? "content"}
      </Text>
      <Text style={styles.subtitle}>
        Why are you reporting {targetLabel ?? "this content"}?
      </Text>

      {REASONS.map((reason) => (
        <Pressable
          key={reason}
          style={[
            styles.reasonRow,
            selectedReason === reason && styles.reasonRowSelected,
          ]}
          onPress={() => setSelectedReason(reason)}
        >
          <Ionicons
            name={
              selectedReason === reason
                ? "radio-button-on"
                : "radio-button-off"
            }
            size={20}
            color={
              selectedReason === reason ? colors.fairway : colors.muted
            }
          />
          <Text style={styles.reasonText}>{reason}</Text>
        </Pressable>
      ))}

      {selectedReason === "Other" ? (
        <TextInput
          value={otherText}
          onChangeText={setOtherText}
          placeholder="Please describe the issue..."
          placeholderTextColor={colors.muted}
          style={styles.otherInput}
          multiline
          maxLength={500}
        />
      ) : null}

      <Pressable
        style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
        onPress={() => void submit()}
        disabled={!canSubmit || submitting}
      >
        <Text style={styles.submitBtnText}>
          {submitting ? "Submitting..." : "Submit report"}
        </Text>
      </Pressable>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 4, gap: 4 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  reasonRowSelected: {
    backgroundColor: colors.fairwaySoft,
  },
  reasonText: { color: colors.text, fontSize: 15, fontWeight: "500" },
  otherInput: {
    backgroundColor: "#f4f2ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 70,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
