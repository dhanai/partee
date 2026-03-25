import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiGet, apiPost } from "../../../lib/api";
import { colors } from "../../../lib/theme";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  joinPolicy: string;
  createdBy: string;
  memberCount: number;
  myRole: "owner" | "admin" | "member" | null;
  conversationId: string | null;
};

type ActivityItem = {
  type: "announcement" | "round_created" | "member_joined";
  id: string;
  body?: string;
  isPinned?: boolean;
  createdAt: string;
  joinedAt?: string;
  roundId?: string;
  courseName?: string | null;
  targetDate?: string;
  user: { id: string; name: string; avatar: string | null };
};

export default function GroupLandingScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState("");

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const token = await getTokenRef.current();
        const [groupData, activityData] = await Promise.all([
          apiGet<{ group: GroupDetail }>(`/api/groups/${groupId}`, token),
          apiGet<{ activity: ActivityItem[] }>(`/api/groups/${groupId}/activity`, token),
        ]);
        setGroup(groupData.group);
        setActivity(activityData.activity);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!group) return;
    const isAdmin = group.myRole === "owner" || group.myRole === "admin";
    navigation.setOptions({
      title: group.name,
      headerRight: () =>
        isAdmin ? (
          <Pressable
            style={styles.headerBtn}
            onPress={() =>
              router.push({
                pathname: "/group/[groupId]/settings",
                params: { groupId: group.id },
              })
            }
            accessibilityLabel="Group settings"
          >
            <Ionicons name="settings-outline" size={18} color={colors.fairway} />
          </Pressable>
        ) : null,
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [navigation, router, group]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true });
  }, [load]);

  const handleJoin = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      const data = await apiPost<{ status: string }>(
        `/api/groups/${groupId}/join`,
        {},
        token,
      );
      if (data.status === "joined" || data.status === "already_member") {
        void load({ silent: true });
      } else if (data.status === "requested") {
        Alert.alert("Request sent", "An admin will review your request.");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not join.");
    }
  }, [groupId, load]);

  const handlePostAnnouncement = useCallback(async () => {
    const body = announceDraft.trim();
    if (!body) return;
    try {
      const token = await getTokenRef.current();
      await apiPost(`/api/groups/${groupId}/announcements`, { body }, token);
      setAnnounceDraft("");
      setShowAnnounceModal(false);
      void load({ silent: true });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post.");
    }
  }, [announceDraft, groupId, load]);

  if (loading && !group) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Group not found.</Text>
      </View>
    );
  }

  const isAdmin = group.myRole === "owner" || group.myRole === "admin";
  const isMember = group.myRole !== null;

  const headerComponent = (
    <View style={styles.headerSection}>
      <View style={styles.heroRow}>
        {group.imageUrl ? (
          <Image source={{ uri: group.imageUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroImageFallback]}>
            <Ionicons name="people" size={32} color={colors.muted} />
          </View>
        )}
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{group.name}</Text>
          <Text style={styles.heroMeta}>
            {group.memberCount} member{group.memberCount !== 1 ? "s" : ""} ·{" "}
            {group.joinPolicy === "public"
              ? "Public"
              : group.joinPolicy === "approval"
                ? "Approval"
                : "Invite only"}
          </Text>
          {group.description ? (
            <Text style={styles.heroDesc} numberOfLines={3}>
              {group.description}
            </Text>
          ) : null}
        </View>
      </View>

      {!isMember && group.joinPolicy !== "invite_only" ? (
        <Pressable style={styles.joinBtn} onPress={handleJoin}>
          <Text style={styles.joinBtnText}>
            {group.joinPolicy === "approval" ? "Request to Join" : "Join Group"}
          </Text>
        </Pressable>
      ) : null}

      {isMember ? (
        <View style={styles.quickActions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              if (group.conversationId) {
                router.push({
                  pathname: "/conversation/[id]/chat",
                  params: { id: group.conversationId },
                });
              }
            }}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.fairway} />
            <Text style={styles.actionLabel}>Chat</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              router.push({
                pathname: "/group/[groupId]/members",
                params: { groupId: group.id },
              })
            }
          >
            <Ionicons name="people-outline" size={18} color={colors.fairway} />
            <Text style={styles.actionLabel}>Members</Text>
          </Pressable>

          {isAdmin ? (
            <>
              <Pressable
                style={styles.actionBtn}
                onPress={() =>
                  router.push({
                    pathname: "/create",
                    params: { mode: "planning", groupId: group.id, session: String(Date.now()) },
                  })
                }
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.fairway} />
                <Text style={styles.actionLabel}>Round</Text>
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => setShowAnnounceModal(true)}
              >
                <Ionicons name="megaphone-outline" size={18} color={colors.fairway} />
                <Text style={styles.actionLabel}>Post</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {activity.length > 0 ? (
        <Text style={styles.activityTitle}>Activity</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={activity}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={headerComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.fairway}
          />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.type === "announcement") {
            return (
              <View style={styles.announcementCard}>
                <View style={styles.announcementHeader}>
                  <Ionicons name="megaphone" size={14} color={colors.fairway} />
                  <Text style={styles.announcementBy}>
                    {item.user.name}
                  </Text>
                  {item.isPinned ? (
                    <Ionicons name="pin" size={12} color={colors.mustard} />
                  ) : null}
                </View>
                <Text style={styles.announcementBody}>{item.body}</Text>
              </View>
            );
          }

          if (item.type === "round_created") {
            return (
              <Pressable
                style={styles.activityRow}
                onPress={() => {
                  if (item.roundId) {
                    router.push(`/round/${item.roundId}`);
                  }
                }}
              >
                {item.user.avatar ? (
                  <Image
                    source={{ uri: item.user.avatar }}
                    style={styles.activityAvatar}
                  />
                ) : (
                  <View style={[styles.activityAvatar, styles.activityAvatarFallback]}>
                    <Ionicons name="person" size={14} color={colors.muted} />
                  </View>
                )}
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText}>
                    <Text style={styles.bold}>{item.user.name}</Text> created a round
                    {item.courseName ? ` at ${item.courseName}` : ""}
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatRelative(item.createdAt)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </Pressable>
            );
          }

          if (item.type === "member_joined") {
            return (
              <View style={styles.activityRow}>
                {item.user.avatar ? (
                  <Image
                    source={{ uri: item.user.avatar }}
                    style={styles.activityAvatar}
                  />
                ) : (
                  <View style={[styles.activityAvatar, styles.activityAvatarFallback]}>
                    <Ionicons name="person" size={14} color={colors.muted} />
                  </View>
                )}
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText}>
                    <Text style={styles.bold}>{item.user.name}</Text> joined the group
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatRelative(item.joinedAt ?? item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }

          return null;
        }}
        ListEmptyComponent={
          isMember ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityText}>
                No activity yet. Create a round or start a chat!
              </Text>
            </View>
          ) : null
        }
      />

      <Modal
        visible={showAnnounceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAnnounceModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowAnnounceModal(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Post Announcement</Text>
            <TextInput
              style={styles.modalInput}
              value={announceDraft}
              onChangeText={setAnnounceDraft}
              placeholder="Write an announcement..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              maxLength={2000}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setShowAnnounceModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalPost,
                  !announceDraft.trim() && styles.modalPostDisabled,
                ]}
                onPress={handlePostAnnouncement}
                disabled={!announceDraft.trim()}
              >
                <Text style={styles.modalPostText}>Post</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  errorText: { color: colors.muted, fontSize: 15 },
  list: { paddingBottom: 40 },
  headerSection: { paddingHorizontal: 16, paddingTop: 12 },
  heroRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroImage: { width: 64, height: 64, borderRadius: 18 },
  heroImageFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: { flex: 1, gap: 2 },
  heroName: { color: colors.text, fontWeight: "700", fontSize: 20 },
  heroMeta: { color: colors.muted, fontSize: 13 },
  heroDesc: { color: colors.text, fontSize: 14, marginTop: 4, lineHeight: 20 },
  joinBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 14,
  },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionLabel: { color: colors.fairway, fontWeight: "600", fontSize: 13 },
  activityTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    marginTop: 24,
    marginBottom: 8,
  },
  announcementCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.fairwaySoft,
    borderWidth: 1,
    borderColor: colors.fairway + "30",
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  announcementBy: { color: colors.fairway, fontWeight: "600", fontSize: 13, flex: 1 },
  announcementBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  activityAvatar: { width: 36, height: 36, borderRadius: 18 },
  activityAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1, gap: 2 },
  activityText: { color: colors.text, fontSize: 14 },
  activityTime: { color: colors.muted, fontSize: 12 },
  bold: { fontWeight: "600" },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActivity: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 40,
  },
  emptyActivityText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: { color: colors.text, fontWeight: "700", fontSize: 18, marginBottom: 12 },
  modalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  modalPost: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalPostDisabled: { opacity: 0.5 },
  modalPostText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
