import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import {
  getInviteSelection,
  InviteSelectionUser,
  setInviteSelection,
} from "../lib/invite-selection-store";
import { colors } from "../lib/theme";

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

export default function InviteFriendsScreen() {
  const navigation = useNavigation();
  const { flowKey, excludeIds } = useLocalSearchParams<{
    flowKey?: string;
    excludeIds?: string;
  }>();
  const key = Array.isArray(flowKey) ? flowKey[0] : flowKey ?? "";
  const excludedUserIds = useMemo(() => {
    const raw = Array.isArray(excludeIds) ? excludeIds[0] : excludeIds;
    if (!raw) return new Set<string>();
    try {
      const ids = JSON.parse(raw) as string[];
      return new Set(ids);
    } catch {
      return new Set<string>();
    }
  }, [excludeIds]);

  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InviteSelectionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsList, setFriendsList] = useState<InviteSelectionUser[]>([]);
  const [selected, setSelected] = useState<InviteSelectionUser[]>([]);
  const debouncedQuery = useDebounce(query, 320);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!key) return;
    setSelected(getInviteSelection(key));
  }, [key]);

  useEffect(() => {
    if (!key) return;
    setInviteSelection(key, selected);
  }, [key, selected]);

  useLayoutEffect(() => {
    const countBubble = (
      <View style={styles.headerCountBubble} accessibilityLabel={`${selected.length} invited`}>
        <Text style={styles.headerCountText}>{selected.length}</Text>
      </View>
    );

    if (Platform.OS === "ios") {
      navigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: { paddingRight: 12 },
        unstable_headerRightItems: () => [
          {
            type: "custom" as const,
            element: countBubble,
            hidesSharedBackground: true,
          },
        ],
      });
    } else {
      navigation.setOptions({
        unstable_headerRightItems: undefined,
        headerRightContainerStyle: { paddingRight: 12 },
        headerRight: () => countBubble,
      });
    }
  }, [navigation, selected.length]);

  useEffect(() => {
    let active = true;
    async function loadFriends() {
      setFriendsLoading(true);
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<{ friends: NetworkFriend[] }>("/api/users/me/network", token);
        if (!active) return;
        const mapped = (json.friends ?? [])
          .map((f) => ({ id: f.id, name: f.name, avatar: f.avatar }))
          .filter((u) => !excludedUserIds.has(u.id));
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
  }, [excludedUserIds]);

  useEffect(() => {
    let active = true;
    async function runUserSearch() {
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
            .map((user) => ({ id: user.id, name: user.name, avatar: user.avatar }))
            .filter((user) => !excludedUserIds.has(user.id)),
        );
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoading(false);
      }
    }
    void runUserSearch();
    return () => {
      active = false;
    };
  }, [debouncedQuery, excludedUserIds]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const isSearching = query.trim().length >= 2;

  /** People you follow (minus excluded), then anyone already selected who isn’t in that list (e.g. search). */
  const friendsRows = useMemo(() => {
    const inFriends = new Set(friendsList.map((f) => f.id));
    const extra = selected.filter(
      (s) => !inFriends.has(s.id) && !excludedUserIds.has(s.id),
    );
    return [...friendsList, ...extra];
  }, [friendsList, selected, excludedUserIds]);

  /** Search hits plus selected rows not already in results so checks stay visible. */
  const searchRows = useMemo(() => {
    const map = new Map<string, InviteSelectionUser>();
    for (const u of results) map.set(u.id, u);
    for (const u of selected) {
      if (!map.has(u.id) && !excludedUserIds.has(u.id)) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [results, selected, excludedUserIds]);

  const rows = isSearching ? searchRows : friendsRows;

  function toggleUser(user: InviteSelectionUser) {
    setSelected((prev) =>
      prev.some((existing) => existing.id === user.id)
        ? prev.filter((existing) => existing.id !== user.id)
        : [...prev, user],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
        ) : null}
        {!loading && query.trim().length > 0 ? (
          <Pressable
            style={styles.inputAccessory}
            onPress={() => setQuery("")}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close" size={15} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {friendsLoading && !isSearching ? (
        <View style={styles.listLoading}>
          <ActivityIndicator size="small" color={colors.muted} />
        </View>
      ) : isSearching && loading && rows.length === 0 ? (
        <View style={styles.listLoading}>
          <ActivityIndicator size="small" color={colors.muted} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>
          {isSearching
            ? "No users found."
            : "No one you follow yet. Search by name to invite anyone."}
        </Text>
      ) : (
        rows.map((user) => (
          <Pressable key={user.id} style={styles.listRow} onPress={() => toggleUser(user)}>
            {user.avatar ? (
              <Image source={{ uri: toAbsoluteUrl(user.avatar) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{user.name.trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>
            )}
            <Text style={styles.listTitle}>{user.name}</Text>
            <View style={styles.listActionIcon}>
              <Ionicons
                name={selectedIds.has(user.id) ? "checkmark" : "add"}
                size={16}
                color={selectedIds.has(user.id) ? colors.fairway : colors.muted}
              />
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8, paddingBottom: 24 },
  inputRow: { position: "relative" },
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
  headerCountBubble: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCountText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.fairway,
  },
  listLoading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: { color: colors.muted, marginTop: 6 },
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
  listTitle: { color: colors.text, fontWeight: "600" },
  listActionIcon: {
    marginLeft: "auto",
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#ece8e1",
    alignItems: "center",
    justifyContent: "center",
  },
});
