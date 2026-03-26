import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { HeaderProfileIcon } from "../../components/header-profile-icon";
import { PressableOpacity } from "../../components/pressable-opacity";
import { apiGet } from "../../lib/api";
import { colors } from "../../lib/theme";

type GroupListItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  heroImageUrl: string | null;
  memberCount: number;
  myRole: "owner" | "admin" | "member" | null;
};

type GroupsResponse = {
  myGroups: GroupListItem[];
  discoverGroups: GroupListItem[];
  searchGroups?: GroupListItem[];
};

type GroupTab = "mine" | "discover";

export default function GroupsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<GroupListItem[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<GroupListItem[]>([]);
  const [activeTab, setActiveTab] = useState<GroupTab>("mine");

  const [tabMetrics, setTabMetrics] = useState<{
    mine: { x: number; width: number } | null;
    discover: { x: number; width: number } | null;
  }>({ mine: null, discover: null });
  const underlineX = useRef(new Animated.Value(0)).current;
  const underlineW = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: 12 },
      headerRight: () => (
        <View style={styles.headerRightRow}>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/create-group")}
            accessibilityLabel="Create a group"
          >
            <Ionicons name="add" size={18} color={colors.fairway} />
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/search-groups")}
            accessibilityLabel="Search groups"
          >
            <Ionicons name="search-outline" size={17} color={colors.fairway} />
          </Pressable>
          <HeaderProfileIcon />
        </View>
      ),
    });
  }, [navigation, router]);

  useEffect(() => {
    const metric = tabMetrics[activeTab];
    if (!metric) return;
    Animated.parallel([
      Animated.timing(underlineX, {
        toValue: metric.x,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(underlineW, {
        toValue: metric.width,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [activeTab, tabMetrics, underlineW, underlineX]);

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

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const focusCountRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      if (focusCountRef.current === 1) {
        void loadRef.current();
      } else {
        void loadRef.current({ silent: true });
      }
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true });
  }, [load]);

  function navigateToGroup(g: GroupListItem) {
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
    });
  }

  function renderGroupRow(g: GroupListItem) {
    return (
      <PressableOpacity
        style={styles.groupCard}
        onPress={() => navigateToGroup(g)}
      >
        {g.imageUrl ? (
          <Image source={{ uri: g.imageUrl }} style={styles.groupAvatar} />
        ) : (
          <View style={[styles.groupAvatar, styles.groupAvatarFallback]}>
            <Ionicons name="people" size={20} color={colors.muted} />
          </View>
        )}
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>
            {g.name}
          </Text>
          <Text style={styles.groupMeta}>
            {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
            {g.myRole ? ` · ${g.myRole === "owner" ? "Owner" : g.myRole === "admin" ? "Admin" : "Member"}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </PressableOpacity>
    );
  }

  if (loading && myGroups.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const activeData = activeTab === "mine" ? myGroups : discoverGroups;

  const listHeader = (
    <>
      <Text style={styles.heading}>Groups</Text>
      <Text style={styles.subheading}>Your communities and groups to explore.</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.tabsRow}>
        <Pressable
          style={styles.tabLink}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, mine: { x, width } }));
          }}
          onPress={() => setActiveTab("mine")}
        >
          <Text style={[styles.tabText, activeTab === "mine" && styles.tabTextActive]}>
            My Groups
          </Text>
        </Pressable>
        <Pressable
          style={styles.tabLink}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, discover: { x, width } }));
          }}
          onPress={() => setActiveTab("discover")}
        >
          <Text style={[styles.tabText, activeTab === "discover" && styles.tabTextActive]}>
            Discover
          </Text>
        </Pressable>
        <Animated.View
          style={[
            styles.tabUnderline,
            {
              transform: [{ translateX: underlineX }],
              width: underlineW,
            },
          ]}
        />
      </View>
    </>
  );

  const emptyTitle =
    activeTab === "mine" ? "No groups yet" : "No groups to discover";
  const emptyMessage =
    activeTab === "mine"
      ? "Create a group to organize rounds with friends, clubs, or leagues."
      : "There are no public groups right now.";

  return (
    <View style={styles.root}>
      <FlatList
        data={activeData}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.fairway}
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => renderGroupRow(item)}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>Something went wrong</Text>
              <Text style={styles.emptySub}>{error}</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptySub}>{emptyMessage}</Text>
              {activeTab === "mine" ? (
                <Pressable
                  style={styles.createBtn}
                  onPress={() => router.push("/create-group")}
                >
                  <Text style={styles.createBtnText}>Create a group</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
      />
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
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 14 },
  errorText: { color: colors.danger, marginBottom: 8 },
  tabsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 8,
    alignSelf: "flex-start",
    position: "relative",
    paddingBottom: 8,
  },
  tabLink: { paddingVertical: 2 },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 15 },
  tabTextActive: { color: colors.text },
  tabUnderline: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.fairway,
    borderRadius: 999,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
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
  createBtn: {
    marginTop: 12,
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
