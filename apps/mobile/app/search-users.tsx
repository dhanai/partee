import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { InitialAvatar } from "../components/initial-avatar";
import { apiDelete, apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { hapticLight } from "../lib/haptics";
import { prefetchPublicProfile } from "../lib/public-profile-cache";
import type { ConnectionRelationship } from "../components/profile-connection-list";
import { colors } from "../lib/theme";

type UserResult = {
  id: string;
  name: string;
  avatar: string | null;
  handicap: string | null;
  relationship: ConnectionRelationship;
};

type SearchResponse = { users: UserResult[] };

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function actionLabel(r: ConnectionRelationship): string | null {
  if (r === "self") return null;
  if (r === "following" || r === "mutual") return "Following";
  if (r === "requested_by_viewer") return "Requested";
  if (r === "requested_to_viewer") return "Follow back";
  return "Follow";
}

function actionDisabled(r: ConnectionRelationship): boolean {
  return r === "self" || r === "requested_by_viewer";
}

function nextRelationshipAfterFollow(
  prev: ConnectionRelationship,
  apiStatus: string,
): ConnectionRelationship {
  if (apiStatus === "requested") return "requested_by_viewer";
  if (prev === "requested_to_viewer") return "mutual";
  return "following";
}

function nextRelationshipAfterUnfollow(
  prev: ConnectionRelationship,
): ConnectionRelationship {
  if (prev === "mutual") return "requested_to_viewer";
  return "none";
}

export default function SearchUsersScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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
        `/api/users/search?q=${encodeURIComponent(q)}`,
        token,
      );
      setResults(data.users ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void search(debouncedQuery.trim());
  }, [debouncedQuery, search]);

  const updateRelationship = useCallback(
    (userId: string, relationship: ConnectionRelationship) => {
      setResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, relationship } : u)),
      );
    },
    [],
  );

  const toggleFollow = useCallback(
    async (user: UserResult) => {
      if (user.relationship === "self") return;
      const token = await getTokenRef.current();
      if (!token) return;

      const shouldUnfollow =
        user.relationship === "following" || user.relationship === "mutual";

      hapticLight();

      const optimistic = shouldUnfollow
        ? nextRelationshipAfterUnfollow(user.relationship)
        : nextRelationshipAfterFollow(user.relationship, "accepted");
      updateRelationship(user.id, optimistic);

      setBusyIds((prev) => new Set(prev).add(user.id));
      try {
        if (shouldUnfollow) {
          await apiDelete(`/api/users/${user.id}/follow`, token);
        } else {
          const res = await apiPost<{ ok: boolean; status: string }>(
            `/api/users/${user.id}/follow`,
            {},
            token,
          );
          const confirmed = nextRelationshipAfterFollow(
            user.relationship,
            res.status,
          );
          if (confirmed !== optimistic) {
            updateRelationship(user.id, confirmed);
          }
        }
      } catch {
        updateRelationship(user.id, user.relationship);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    },
    [updateRelationship],
  );

  const listState = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return "idle" as const;
    if (searching && results.length === 0) return "searching" as const;
    if (!searching && results.length === 0) return "empty" as const;
    return "results" as const;
  }, [query, searching, results.length]);

  const renderItem = useCallback(
    ({ item: u }: { item: UserResult }) => {
      const label = actionLabel(u.relationship);
      const isBusy = busyIds.has(u.id);
      const disabled = actionDisabled(u.relationship) || isBusy;
      const isFollowingStyle =
        u.relationship === "following" || u.relationship === "mutual";

      return (
        <View style={styles.row}>
          <Pressable
            style={styles.rowMain}
            onPressIn={() => {
              prefetchPublicProfile(u.id, () => getTokenRef.current());
              if (u.avatar) Image.prefetch(toAbsoluteUrl(u.avatar));
            }}
            onPress={() =>
              router.push({
                pathname: "/profile/[userId]",
                params: {
                  userId: u.id,
                  userName: u.name,
                  userAvatar: u.avatar ?? "",
                },
              })
            }
          >
            {u.avatar ? (
              <Image
                source={toAbsoluteUrl(u.avatar)}
                style={styles.avatar}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <InitialAvatar name={u.name} size={44} />
            )}
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {u.name}
              </Text>
              {u.handicap?.trim() ? (
                <Text style={styles.sub} numberOfLines={1}>
                  Handicap {u.handicap.trim()}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {label ? (
            <Pressable
              style={[
                styles.actionBtn,
                isFollowingStyle
                  ? styles.actionBtnFollowing
                  : styles.actionBtnFollow,
                disabled && styles.actionBtnDisabled,
              ]}
              onPress={() => void toggleFollow(u)}
              disabled={disabled}
            >
              {isBusy ? (
                <ActivityIndicator
                  color={isFollowingStyle ? colors.text : "#fff"}
                  size="small"
                />
              ) : (
                <Text
                  style={
                    isFollowingStyle
                      ? styles.actionTextFollowing
                      : styles.actionTextFollow
                  }
                  numberOfLines={1}
                >
                  {label}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      );
    },
    [busyIds, toggleFollow, router],
  );

  const keyExtractor = useCallback((u: UserResult) => u.id, []);

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {listState === "searching" ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : listState === "empty" ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.emptySub}>
            Try a different name or invite them to Parfade.
          </Text>
        </View>
      ) : listState === "idle" ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="person-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Find golfers</Text>
          <Text style={styles.emptySub}>
            Type at least two letters to search by name.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
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
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: "#dfe6df" },
  meta: { flex: 1, minWidth: 0 },
  name: { fontWeight: "700", color: colors.text, fontSize: 16 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  actionBtn: {
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnFollow: {
    backgroundColor: colors.fairway,
  },
  actionBtnFollowing: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionTextFollow: { color: "#fff", fontWeight: "700", fontSize: 13 },
  actionTextFollowing: { color: colors.text, fontWeight: "700", fontSize: 13 },
});
