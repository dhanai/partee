import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";
import { colors } from "../lib/theme";

type DatePickerModalProps = {
  visible: boolean;
  title: string;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
  minimumDate?: Date | null;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DatePickerModal({
  visible,
  title,
  selectedDate,
  onSelectDate,
  onClose,
  minimumDate,
}: DatePickerModalProps) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const minDay = useMemo(
    () => (minimumDate ? startOfDay(minimumDate) : null),
    [minimumDate],
  );

  useEffect(() => {
    if (!visible) return;
    const base = selectedDate ?? minimumDate ?? new Date();
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [visible, selectedDate, minimumDate]);

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstWeekday = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();
  const dayCells = [
    ...Array.from({ length: firstWeekday }).map(() => null),
    ...Array.from({ length: daysInMonth }).map((_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  function shiftMonth(delta: number) {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + delta,
      1,
    );
    if (minDay) {
      const minMonthStart = new Date(minDay.getFullYear(), minDay.getMonth(), 1);
      if (next < minMonthStart) return;
    }
    setCalendarMonth(next);
  }

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      sheetStyle={styles.sheet}
    >
      <Text style={styles.modalTitle}>{title}</Text>
      <View style={styles.monthNavRow}>
        <Pressable style={styles.monthNavBtn} onPress={() => shiftMonth(-1)}>
          <Ionicons name="chevron-back" size={16} color={colors.fairway} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable style={styles.monthNavBtn} onPress={() => shiftMonth(1)}>
          <Ionicons name="chevron-forward" size={16} color={colors.fairway} />
        </Pressable>
      </View>
      <View style={styles.weekHeader}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
          <Text key={`${d}-${idx}`} style={styles.weekHeaderText}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {dayCells.map((dayNum, idx) => {
          if (dayNum === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
          const dayDate = new Date(
            calendarMonth.getFullYear(),
            calendarMonth.getMonth(),
            dayNum,
          );
          const isDisabled =
            minDay ? startOfDay(dayDate).getTime() < minDay.getTime() : false;
          const selected = selectedDate ? isSameDay(dayDate, selectedDate) : false;
          return (
            <Pressable
              key={`day-${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}-${dayNum}-${idx}`}
              style={[styles.dayCell, isDisabled && styles.dayDisabled]}
              onPress={() => {
                if (isDisabled) return;
                onSelectDate(startOfDay(dayDate));
                onClose();
              }}
              disabled={isDisabled}
            >
              <View style={[styles.dayPill, selected && styles.dayPillSelected]}>
                <Text
                  style={[
                    styles.dayText,
                    selected && styles.dayTextSelected,
                    isDisabled && styles.dayTextDisabled,
                  ]}
                >
                  {dayNum}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.modalDoneBtn} onPress={onClose}>
        <Text style={styles.modalDoneText}>Done</Text>
      </Pressable>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 14,
    paddingTop: 4,
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  monthNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: "#f3f1ed",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekHeaderText: {
    width: "14.2857%",
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.2857%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  dayPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillSelected: { backgroundColor: colors.fairway },
  dayDisabled: { opacity: 0.35 },
  dayText: { color: colors.text, fontWeight: "600", textAlign: "center", width: "100%" },
  dayTextSelected: { color: "#fff" },
  dayTextDisabled: { color: colors.muted },
  modalDoneBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 2,
  },
  modalDoneText: { color: "#fff", fontWeight: "700" },
});
