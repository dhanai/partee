import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
} from "./animated-bottom-sheet-frame";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import type { InviteSelectionUser } from "../lib/invite-selection-store";
import { colors } from "../lib/theme";
import { parfadeUserAvatarUrlForDisplay } from "../lib/user-avatar-display";

type NetworkFriend = {
  id: string;
  name: string;
  avatar: string | null;
  handicap: string | null;
};

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const SNAP_POINTS = ["75%"] as const;

type InviteFriendsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps the confirm button. */
  onConfirm: (selected: InviteSelectionUser[]) => void;
  /** Label for the confirm button. */
  confirmLabel?: string;
  /** User IDs to hide from the list (e.g. already confirmed players). */
  excludeIds?: Set<string>;
  /** Pre-selected users when the sheet opens. */
  initialSelected?: InviteSelectionUser[];
};

export function InviteFriendsSheet({
  visible,
  onClose,
  onConfirm,
  confirmLabel = "Add friends",
  excludeIds,
  initialSelected,
}: InviteFriendsSheetProps) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const excludedSet = excludeIds ?? emptySet;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InviteSelectionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsList, setFriendsList] = useState<InviteSelectionUser[]>([]);
  const [selected, setSelected] = useState<InviteSelectionUser[]>([]);
  const debouncedQuery = useDebounce(query, 320);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!visible) {
      hasInitialized.current = false;
      return;
    }
    setSelected(initialSelected ?? []);
    setQuery("");
    setResults([]);
    hasInitialized.current = true;
  }, [visible, initialSelected]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    async function loadFriends() {
      setFriendsLoading(true);
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<{ friends: NetworkFriend[] }>(
          "/api/users/me/network",
          token,
        );
        if (!active) return;
        const mapped = (json.friends ?? [])
          .map((f) => ({ id: f.id, name: f.name, avatar: f.avatar }))
          .filter((u) => !excludedSet.has(u.id));
        setFriendsList(mapped);
      } catch {
        if (active) setFriendsList([]);
      } finally {
        if (active) setFriendsLoading(false);
      }
    }
    void loadFriends();
    return () => {
      active = false;
    };
  }, [visible, excludedSet]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    async function runSearch() {
      const q = debouncedQuery.trim();
      if (q.length < 2) {
        if (active) setResults([]);
        return;
      }
      setLoading(true);
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<{
          users: Array<InviteSelectionUser & { email: string | null }>;
        }>(`/api/users/search?q=${encodeURIComponent(q)}`, token);
        if (!active) return;
        setResults(
          json.users
            .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar }))
            .filter((u) => !excludedSet.has(u.id)),
        );
      } catch {
        /* swallow */
      } finally {
        if (active) setLoading(false);
      }
    }
    void runSearch();
    return () => {
      active = false;
    };
  }, [visible, debouncedQuery, excludedSet]);

  const selectedIds = useMemo(
    () => new Set(selected.map((u) => u.id)),
    [selected],
  );

  const isSearching = query.trim().length >= 2;

  const friendsRows = useMemo(() => {
    const inFriends = new Set(friendsList.map((f) => f.id));
    const extra = selected.filter(
      (s) => !inFriends.has(s.id) && !excludedSet.has(s.id),
    );
    return [...friendsList, ...extra];
  }, [friendsList, selected, excludedSet]);

  const searchRows = useMemo(() => {
    const map = new Map<string, InviteSelectionUser>();
    for (const u of results) map.set(u.id, u);
    for (const u of selected) {
      if (!map.has(u.id) && !excludedSet.has(u.id)) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [results, selected, excludedSet]);

  const rows = isSearching ? searchRows : friendsRows;

  const toggleUser = useCallback((user: InviteSelectionUser) => {
    setSelected((prev) =>
      prev.some((e) => e.id === user.id)
        ? prev.filter((e) => e.id !== user.id)
        : [...prev, user],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(selected);
  }, [onConfirm, selected]);

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      sheetStyle={styles.sheet}
      enableContentPanningGesture={false}
      dragHandle
    >
      <Text style={styles.title}>Invite Friends</Text>

      <View style={styles.inputRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name..."
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.inputWithAccessory]}
        />
        {loading && query.trim().length >= 2 ? (
          <View style={styles.inputAccessory}>
            <ActivityIndicator size="small" color={colors.muted} />
          </View>
        ) : query.trim().length > 0 ? (
          <Pressable
            style={styles.inputAccessory}
            onPress={() => setQuery("")}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close" size={15} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {friendsLoading && !isSearching ? (
          <View style={styles.listLoading}>
            <ActivityIndicator size="small" color={colors.muted} />
          </View>
        ) : isSearching && loading && rows.length === 0 ? (
          <View style={styles.listLoading}>
            <ActivityIndicator size="small" color={colors.muted} />
          </View>
        ) : rows.length === 0 ? (
          isSearching ? (
            <Text style={styles.emptyText}>No matches found.</Text>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="people-outline" size={28} color={colors.fairway} />
              </View>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyBody}>
                Golfers you follow appear here. Search above to find anyone by name.
              </Text>
            </View>
          )
        ) : (
          rows.map((user) => {
            const displayAvatar = parfadeUserAvatarUrlForDisplay(user.avatar);
            return (
            <Pressable
              key={user.id}
              style={styles.listRow}
              onPress={() => toggleUser(user)}
            >
              {displayAvatar ? (
                <Image
                  source={{ uri: toAbsoluteUrl(displayAvatar) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>
                    {user.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <Text style={styles.listName}>{user.name}</Text>
              <View
                style={[
                  styles.listCheck,
                  selectedIds.has(user.id) && styles.listCheckActive,
                ]}
              >
                <Ionicons
                  name={selectedIds.has(user.id) ? "checkmark" : "add"}
                  size={14}
                  color={selectedIds.has(user.id) ? "#fff" : colors.muted}
                />
              </View>
            </Pressable>
            );
          })
        )}
      </BottomSheetScrollView>

      <Pressable
        style={[styles.confirmBtn, selected.length === 0 && styles.confirmDisabled]}
        onPress={handleConfirm}
        disabled={selected.length === 0}
      >
        <Text style={styles.confirmText}>
          {confirmLabel}
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </Text>
      </Pressable>
    </AnimatedBottomSheetFrame>
  );
}

const emptySet = new Set<string>();

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
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
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
  avatar: { width: 30, height: 30, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.fairway, fontSize: 12, fontWeight: "700" },
  listName: { color: colors.text, fontWeight: "600", flex: 1 },
  listCheck: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#ece8e1",
    alignItems: "center",
    justifyContent: "center",
  },
  listCheckActive: {
    backgroundColor: colors.fairway,
  },
  confirmBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
