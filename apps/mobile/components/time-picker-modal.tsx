import { useEffect, useState } from "react";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

type TimePickerModalProps = {
  visible: boolean;
  title: string;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
};

export function TimePickerModal({
  visible,
  title,
  value,
  onChange,
  onClose,
}: TimePickerModalProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (visible) {
      setDraftValue(value);
    }
  }, [visible, value]);

  if (!visible) return null;

  if (Platform.OS === "ios") {
    return (
      <Modal visible transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{title}</Text>
            <DateTimePicker
              value={draftValue}
              mode="time"
              display="spinner"
              onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                if (selected) setDraftValue(selected);
              }}
            />
            <View style={styles.actionsRow}>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={onClose}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={() => {
                  onChange(draftValue);
                  onClose();
                }}
              >
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <DateTimePicker
      value={value}
      mode="time"
      display="default"
      onChange={(event: DateTimePickerEvent, selected?: Date) => {
        onClose();
        if (event.type === "set" && selected) {
          onChange(selected);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  actionsRow: { flexDirection: "row", gap: 8 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButton: { backgroundColor: colors.fairway },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondaryButton: { backgroundColor: "#ece8e1" },
  secondaryText: { color: colors.text, fontWeight: "700" },
});
