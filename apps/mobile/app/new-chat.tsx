import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

type Friend = {
  id: string;
  name: string;
  avatar: string | null;
  handicap: string | null;
};

type FriendsResponse = { friends: Friend[] };
type CreateConvResponse = { conversationId: string; existing: boolean };

export default function NewChatScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const searchInputRef = useRef<TextInput>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      searchInputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const authToken = await getTokenRef.current();
        const data = await apiGet<FriendsResponse>("/api/users/me/friends", authToken);
        setFriends(data.friends);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = search.trim()
    ? friends.filter((f) =>
        f.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : friends;

  const onSelectFriend = useCallback(
    async (friend: Friend) => {
      if (creating) return;
      setCreating(friend.id);
      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<CreateConvResponse>(
          "/api/conversations",
          { participantUserId: friend.id },
          authToken,
        );
        router.replace({
          pathname: "/conversation/[id]/chat",
          params: {
            id: data.conversationId,
            chatTitle: friend.name,
            chatAvatars: JSON.stringify(friend.avatar ? [friend.avatar] : []),
            chatType: "dm",
          },
        });
      } catch {
        setCreating(null);
      }
    },
    [creating, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Friend }) => {
      return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => void onSelectFriend(item)}
        disabled={creating === item.id}
      >
        {item.avatar ? (
          <Image
            source={{ uri: toAbsoluteUrl(item.avatar) }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.handicap ? (
            <Text style={styles.handicap}>Handicap: {item.handicap}</Text>
          ) : null}
        </View>
        {creating === item.id ? (
          <ActivityIndicator color={colors.fairway} size="small" />
        ) : null}
      </Pressable>
      );
    },
    [creating, onSelectFriend],
  );

  return (
    <>
      <Stack.Screen options={{ title: "New Message", headerBackTitle: "Chats" }} />
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search friends…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.fairway} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={36} color={colors.border} />
            <Text style={styles.emptyText}>
              {friends.length === 0
                ? "No mutual friends yet. Follow someone and have them follow you back!"
                : "No friends match your search."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(f) => f.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f1efea",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: colors.fairwaySoft,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.fairway,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  handicap: {
    fontSize: 13,
    color: colors.muted,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
