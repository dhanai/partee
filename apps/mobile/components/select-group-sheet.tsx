import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "./animated-bottom-sheet-frame";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

type GroupOption = {
  id: string;
  name: string;
  imageUrl: string | null;
};

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Match `InviteFriendsSheet` — single detent + keyboard-friendly search. */
const SNAP_POINTS = ["55%"] as const;

type SelectGroupSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (group: GroupOption) => void;
  selectedGroupId: string | null;
};

export function SelectGroupSheet({
  visible,
  onClose,
  onSelect,
  selectedGroupId,
}: SelectGroupSheetProps) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const debouncedQuery = useDebounce(query, 320);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const token = await getTokenRef.current();
        const data = await apiGet<{ myGroups: GroupOption[] }>("/api/groups", token);
        if (active) setGroups(data.myGroups);
      } catch {
        if (active) setGroups([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [visible]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, debouncedQuery]);

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      sheetStyle={styles.sheet}
      enableContentPanningGesture={false}
      dragHandle
    >
      <Text style={styles.title}>Select Group</Text>

      {groups.length > 3 && (
        <View style={styles.inputRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups..."
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.inputWithAccessory]}
          />
          {query.trim().length > 0 ? (
            <Pressable
              style={styles.inputAccessory}
              onPress={() => setQuery("")}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close" size={15} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      )}

      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.listLoading}>
            <ActivityIndicator size="small" color={colors.muted} />
          </View>
        ) : filtered.length === 0 ? (
          debouncedQuery.trim().length > 0 ? (
            <Text style={styles.emptyText}>No groups match your search.</Text>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="people-outline" size={28} color={colors.fairway} />
              </View>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyBody}>
                Join or create a group to post rounds there.
              </Text>
            </View>
          )
        ) : (
          filtered.map((group) => {
            const isSelected = group.id === selectedGroupId;
            return (
              <Pressable
                key={group.id}
                style={styles.listRow}
                onPress={() => onSelect(group)}
              >
                {group.imageUrl ? (
                  <Image
                    source={{ uri: toAbsoluteUrl(group.imageUrl) }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="people" size={14} color={colors.fairway} />
                  </View>
                )}
                <Text style={styles.listName} numberOfLines={1}>{group.name}</Text>
                <View
                  style={[
                    styles.listCheck,
                    isSelected && styles.listCheckActive,
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </BottomSheetScrollView>
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  inputRow: { position: "relative", marginBottom: 8 },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
  },
  inputWithAccessory: { paddingRight: 38 },
  inputAccessory: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ece8e1",
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 8, paddingBottom: 8 },
  listLoading: { paddingVertical: 24, alignItems: "center" },
  emptyText: { color: colors.muted, marginTop: 6, fontSize: 15, lineHeight: 22 },
  emptyState: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: "center",
    gap: 10,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 300,
  },
  listRow: {
    backgroundColor: "#f9f7f3",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  /** Match `InviteFriendsSheet` — row avatar size. */
  avatar: { width: 30, height: 30, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  listName: { color: colors.text, fontWeight: "600", flex: 1 },
  listCheck: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#ece8e1",
    alignItems: "center",
    justifyContent: "center",
  },
  listCheckActive: { backgroundColor: colors.fairway },
});
