import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image, ImagePrefetch } from "expo-image";
import { apiDelete, apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { hapticLight } from "../lib/haptics";
import { InitialAvatar } from "./initial-avatar";
import { prefetchPublicProfile } from "../lib/public-profile-cache";
import { colors } from "../lib/theme";

export type ConnectionRelationship =
  | "self"
  | "none"
  | "requested_by_viewer"
  | "requested_to_viewer"
  | "following"
  | "followed_by"
  | "mutual";

type ListUser = {
  id: string;
  name: string;
  avatar: string | null;
  handicap: string | null;
  relationship: ConnectionRelationship;
};

type ListResponse = { users: ListUser[] };

type Props = {
  kind: "followers" | "following";
  ownerUserId: string;
};

export function ProfileConnectionList({ kind, ownerUserId }: Props) {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<ListUser[]>([]);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: kind === "followers" ? "Followers" : "Following",
    });
  }, [kind, navigation]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!ownerUserId) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const token = await getTokenRef.current();
      const path =
        kind === "followers"
          ? `/api/users/${ownerUserId}/followers`
          : `/api/users/${ownerUserId}/following`;
      const data = await apiGet<ListResponse>(path, token);
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [ownerUserId, kind]);

  const didInitialLoad = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didInitialLoad.current) {
        void load({ silent: true });
      } else {
        didInitialLoad.current = true;
        void load();
      }
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q));
  }, [users, query]);

  const updateRelationship = useCallback(
    (userId: string, relationship: ConnectionRelationship) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, relationship } : u)),
      );
    },
    [],
  );

  const toggleFollow = useCallback(
    async (row: ListUser) => {
      if (row.relationship === "self" || row.relationship === "requested_by_viewer") return;
      const token = await getTokenRef.current();
      if (!token) return;

      const shouldUnfollow =
        row.relationship === "following" || row.relationship === "mutual";

      hapticLight();

      const optimistic: ConnectionRelationship = shouldUnfollow
        ? row.relationship === "mutual"
          ? "requested_to_viewer"
          : "none"
        : row.relationship === "requested_to_viewer"
          ? "mutual"
          : "following";
      updateRelationship(row.id, optimistic);

      setBusyIds((prev) => new Set(prev).add(row.id));
      setError(null);
      try {
        if (shouldUnfollow) {
          await apiDelete(`/api/users/${row.id}/follow`, token);
        } else {
          const res = await apiPost<{ ok: boolean; status: string }>(
            `/api/users/${row.id}/follow`,
            {},
            token,
          );
          if (res.status === "requested") {
            updateRelationship(row.id, "requested_by_viewer");
          }
        }
      } catch {
        updateRelationship(row.id, row.relationship);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [updateRelationship],
  );

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

  if (!ownerUserId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing profile.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              {query.trim() ? "No matches." : kind === "followers" ? "No followers yet." : "Not following anyone yet."}
            </Text>
          ) : (
            filtered.map((u) => {
              const label = actionLabel(u.relationship);
              const isBusy = busyIds.has(u.id);
              const disabled = actionDisabled(u.relationship) || isBusy;
              const isFollowingStyle =
                u.relationship === "following" || u.relationship === "mutual";
              return (
                <View key={u.id} style={styles.row}>
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
                      <Image source={toAbsoluteUrl(u.avatar)} style={styles.avatar} />
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
                        isFollowingStyle ? styles.actionBtnFollowing : styles.actionBtnFollow,
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
                            isFollowingStyle ? styles.actionTextFollowing : styles.actionTextFollow
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
            })
          )}
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
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 4 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  muted: { color: colors.muted },
  error: { color: colors.danger, textAlign: "center" },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.fairwaySoft,
    borderRadius: 12,
  },
  retryText: { color: colors.fairway, fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: "#dfe6df" },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  avatarInitial: { color: colors.fairway, fontWeight: "700", fontSize: 16 },
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
