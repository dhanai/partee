import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet } from "../../lib/api";
import { PressableOpacity } from "../../components/pressable-opacity";
import { colors } from "../../lib/theme";

type GroupListItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  heroImageUrl: string | null;
  memberCount: number;
  myRole: "owner" | "admin" | "member";
};

type GroupsResponse = {
  myGroups: GroupListItem[];
  discoverGroups: GroupListItem[];
};

export default function GroupsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<GroupListItem[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<GroupListItem[]>([]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<GroupsResponse>("/api/groups", token);
      setMyGroups(data.myGroups);
      setDiscoverGroups(data.discoverGroups);
    } catch {
      if (myGroups.length === 0 && discoverGroups.length === 0) {
        setError("Unable to load groups. Pull to retry.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myGroups.length, discoverGroups.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true });
  }, [load]);

  if (loading && myGroups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const sections: { type: "header"; title: string }[] | { type: "group"; group: GroupListItem }[] =
    [];
  const data: ({ type: "header"; title: string } | { type: "group"; group: GroupListItem } | { type: "empty" })[] = [];

  if (myGroups.length > 0) {
    data.push({ type: "header", title: "My Groups" });
    for (const g of myGroups) data.push({ type: "group", group: g });
  }

  if (discoverGroups.length > 0) {
    data.push({ type: "header", title: "Discover Groups" });
    for (const g of discoverGroups) data.push({ type: "group", group: g });
  }

  if (data.length === 0) {
    data.push({ type: "empty" });
  }

  if (error && data.length === 1 && data[0].type === "empty") {
    data.length = 0;
    data.push({ type: "empty" });
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={data}
        keyExtractor={(item, i) =>
          item.type === "group" ? item.group.id : `${item.type}-${i}`
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.fairway}
          />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return <Text style={styles.sectionTitle}>{item.title}</Text>;
          }
          if (item.type === "empty") {
            return error ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
                <Text style={styles.emptyTitle}>Something went wrong</Text>
                <Text style={styles.emptySub}>{error}</Text>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={colors.border}
                />
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptySub}>
                  Create a group to organize rounds with friends, clubs, or
                  leagues.
                </Text>
                <Pressable
                  style={styles.createBtn}
                  onPress={() => router.push("/create-group")}
                >
                  <Text style={styles.createBtnText}>Create a group</Text>
                </Pressable>
              </View>
            );
          }
          const g = item.group;
          return (
            <PressableOpacity
              style={styles.groupCard}
              onPress={() =>
                router.push({
                  pathname: "/group/[groupId]",
                  params: {
                    groupId: g.id,
                    hintName: g.name,
                    hintImage: g.imageUrl ?? "",
                    hintHero: g.heroImageUrl ?? "",
                    hintMembers: String(g.memberCount),
                    hintRole: g.myRole,
                  },
                })
              }
            >
              {g.imageUrl ? (
                <Image
                  source={{ uri: g.imageUrl }}
                  style={styles.groupAvatar}
                />
              ) : (
                <View style={[styles.groupAvatar, styles.groupAvatarFallback]}>
                  <Ionicons
                    name="people"
                    size={20}
                    color={colors.muted}
                  />
                </View>
              )}
              <View style={styles.groupInfo}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.groupMeta}>
                  {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.muted}
              />
            </PressableOpacity>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push("/create-group")}
        accessibilityLabel="Create a group"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  list: { paddingBottom: 100 },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  groupAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { color: colors.text, fontWeight: "600", fontSize: 15 },
  groupMeta: { color: colors.muted, fontSize: 13 },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 80,
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
  createBtn: {
    marginTop: 12,
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.fairway,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
});
