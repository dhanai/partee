import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { colors } from "../lib/theme";

export type OverflowMenuItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: OverflowMenuItem[];
};

export function OverflowMenuSheet({ visible, onClose, items }: Props) {
  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel="Dismiss menu"
      sheetStyle={styles.sheet}
    >
      <View style={styles.actions}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={styles.row}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={20}
                color={item.destructive ? colors.danger : colors.text}
              />
            ) : null}
            <Text style={[styles.rowText, item.destructive && styles.destructiveText]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 8,
  },
  actions: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  rowText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 16,
  },
  destructiveText: {
    color: colors.danger,
  },
});
