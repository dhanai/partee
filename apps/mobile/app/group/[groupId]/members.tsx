import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { InviteFriendsSheet } from "../../../components/invite-friends-sheet";
import { apiDelete, apiGet, apiPost } from "../../../lib/api";
import { colors } from "../../../lib/theme";
import { InitialAvatar } from "../../../components/initial-avatar";

type Member = {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

export default function GroupMembersScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [members, setMembers] = useState<Member[]>([]);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<{ members: Member[]; viewerRole: string | null }>(
        `/api/groups/${groupId}/members`,
        token,
      );
      setMembers(data.members);
      setViewerRole(data.viewerRole);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isAdmin = viewerRole === "owner" || viewerRole === "admin";

  const handleRemove = useCallback(
    (userId: string, name: string) => {
      Alert.alert("Remove member", `Remove ${name} from the group?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getTokenRef.current();
              await apiDelete(`/api/groups/${groupId}/members?userId=${userId}`, token);
              setMembers((prev) => prev.filter((m) => m.userId !== userId));
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
            }
          },
        },
      ]);
    },
    [groupId],
  );

  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);

  const existingMemberIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  useLayoutEffect(() => {
    if (!isAdmin) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setInviteSheetOpen(true)}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Ionicons name="person-add-outline" size={22} color={colors.fairway} />
        </Pressable>
      ),
    });
  }, [navigation, isAdmin]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const roleLabel = (r: string) =>
    r === "owner" ? "Owner" : r === "admin" ? "Admin" : "";

  return (
    <View style={styles.root}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.fairway}
          />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          return (
          <View style={styles.memberRow}>
            <Pressable
              style={styles.memberTap}
              onPress={() =>
                router.push({
                  pathname: "/profile/[userId]",
                  params: {
                    userId: item.userId,
                    userName: item.name,
                    userAvatar: item.avatar ?? "",
                  },
                })
              }
            >
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <InitialAvatar name={item.name} size={42} maxInitials={2} />
              )}
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{item.name}</Text>
                {item.role !== "member" ? (
                  <Text style={styles.memberRole}>{roleLabel(item.role)}</Text>
                ) : null}
              </View>
            </Pressable>
            {isAdmin && item.role === "member" ? (
              <Pressable
                style={styles.removeBtn}
                onPress={() => handleRemove(item.userId, item.name)}
              >
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          );
        }}
      />

      <InviteFriendsSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        onConfirm={async (users) => {
          setInviteSheetOpen(false);
          if (users.length === 0) return;
          try {
            const token = await getTokenRef.current();
            await apiPost(
              `/api/groups/${groupId}/members`,
              { userIds: users.map((u) => u.id) },
              token,
            );
            void load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Unable to invite.");
          }
        }}
        confirmLabel="Invite to group"
        excludeIds={existingMemberIds}
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
  list: { paddingBottom: 40 },
  headerBtn: { marginRight: 4 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  memberTap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { color: colors.text, fontWeight: "600", fontSize: 15 },
  memberRole: { color: colors.fairway, fontSize: 12, fontWeight: "500" },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
