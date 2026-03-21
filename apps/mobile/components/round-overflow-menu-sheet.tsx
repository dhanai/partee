import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { colors } from "../lib/theme";

export type RoundOverflowMenuItem = {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: RoundOverflowMenuItem[];
};

export function RoundOverflowMenuSheet({ visible, onClose, items }: Props) {
  return (
    <AnimatedBottomSheetFrame visible={visible} onClose={onClose} backdropAccessibilityLabel="Dismiss menu">
      <View>
        {items.map((item, index) => (
          <Pressable
            key={item.key}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowBorder,
              pressed && styles.rowPressed,
            ]}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.rowLabel, item.destructive && styles.destructiveLabel]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [styles.cancelRow, pressed && styles.rowPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: "#f5f3ef",
  },
  rowLabel: {
    fontSize: 17,
    color: colors.text,
    fontWeight: "500",
    textAlign: "center",
  },
  destructiveLabel: {
    color: colors.danger,
    fontWeight: "600",
  },
  cancelRow: {
    marginTop: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f1efea",
  },
  cancelLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
});
