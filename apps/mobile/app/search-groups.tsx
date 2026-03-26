import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { InitialAvatar } from "../components/initial-avatar";
import { PressableOpacity } from "../components/pressable-opacity";
import { apiGet } from "../lib/api";
import { colors } from "../lib/theme";

type GroupResult = {
  id: string;
  name: string;
  imageUrl: string | null;
  heroImageUrl: string | null;
  memberCount: number;
  myRole: "owner" | "admin" | "member" | null;
};

type SearchResponse = {
  myGroups: GroupResult[];
  discoverGroups: GroupResult[];
  searchGroups?: GroupResult[];
};

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchGroupsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  const debouncedQuery = useDebounce(query, 350);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<SearchResponse>(
        `/api/groups?q=${encodeURIComponent(q)}`,
        token,
      );
      setResults(data.searchGroups ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void search(debouncedQuery.trim());
  }, [debouncedQuery, search]);

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search groups"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {searching ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : query.trim().length >= 2 && results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No groups found</Text>
          <Text style={styles.emptySub}>
            Try a different search term or create a new group.
          </Text>
        </View>
      ) : query.trim().length < 2 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Find a group</Text>
          <Text style={styles.emptySub}>
            Search by group name to find communities.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {results.map((g) => (
            <PressableOpacity
              key={g.id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/group/[groupId]",
                  params: {
                    groupId: g.id,
                    hintName: g.name,
                    hintImage: g.imageUrl ?? "",
                    hintHero: g.heroImageUrl ?? "",
                    hintMembers: String(g.memberCount),
                    hintRole: g.myRole ?? "",
                  },
                })
              }
            >
              {g.imageUrl ? (
                <Image source={{ uri: g.imageUrl }} style={styles.avatar} />
              ) : (
                <InitialAvatar name={g.name} size={44} borderRadius={12} />
              )}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.sub}>
                  {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                  {g.myRole ? " · Joined" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </PressableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 17,
    marginTop: 8,
  },
  emptySub: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 12 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontWeight: "700", color: colors.text, fontSize: 16 },
  sub: { color: colors.muted, fontSize: 13 },
});
