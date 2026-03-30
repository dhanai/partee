import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

export type InviteFriendUser = {
  id: string;
  name: string;
  avatar: string | null;
};

type InviteFriendsPickerProps = {
  query: string;
  onChangeQuery: (value: string) => void;
  onClearQuery: () => void;
  placeholder?: string;
  loading: boolean;
  results: InviteFriendUser[];
  selected: InviteFriendUser[];
  onToggleUser: (user: InviteFriendUser) => void;
  onRemoveUser: (userId: string) => void;
};

export function InviteFriendsPicker({
  query,
  onChangeQuery,
  onClearQuery,
  placeholder = "Search by name...",
  loading,
  results,
  selected,
  onToggleUser,
  onRemoveUser,
}: InviteFriendsPickerProps) {
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;
  const showInputSpinner = loading && isSearching;
  const selectedIds = new Set(selected.map((user) => user.id));
  const selectedMap = useMemo(() => new Map(selected.map((user) => [user.id, user])), [selected]);
  const searchingRows = useMemo(() => {
    const unique = new Map<string, InviteFriendUser>();
    for (const user of results) unique.set(user.id, user);
    for (const user of selected) {
      if (!unique.has(user.id)) unique.set(user.id, user);
    }
    return Array.from(unique.values());
  }, [results, selected]);

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.inputWithAccessory]}
        />
        {showInputSpinner ? (
          <View style={styles.inputAccessory}>
            <ActivityIndicator size="small" color={colors.muted} />
          </View>
        ) : null}
        {!showInputSpinner && trimmedQuery.length > 0 ? (
          <Pressable style={styles.inputAccessory} onPress={onClearQuery}>
            <Ionicons name="close" size={15} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {isSearching
        ? searchingRows.map((user) => {
            return (
          <Pressable key={user.id} style={styles.listRow} onPress={() => onToggleUser(user)}>
            {user.avatar ? (
              <Image source={{ uri: toAbsoluteUrl(user.avatar) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(user.name ?? "?").trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>
            )}
            <Text style={styles.listTitle}>{user.name}</Text>
            <View style={styles.listActionIcon}>
              <Ionicons
                name={selectedIds.has(user.id) ? "checkmark" : "add"}
                size={15}
                color={selectedIds.has(user.id) ? colors.fairway : colors.muted}
              />
            </View>
          </Pressable>
          );
          })
        : selected.map((user) => {
            const resolved = selectedMap.get(user.id) ?? user;
            return (
              <View key={resolved.id} style={styles.selectedRow}>
                <View style={styles.selectedInfo}>
                  {resolved.avatar ? (
                    <Image source={{ uri: toAbsoluteUrl(resolved.avatar) }} style={styles.selectedAvatar} />
                  ) : (
                    <View style={[styles.selectedAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {(resolved.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.selectedText}>{resolved.name}</Text>
                </View>
                <Pressable style={styles.removeIconBtn} onPress={() => onRemoveUser(resolved.id)}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    position: "relative",
  },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
  },
  inputWithAccessory: {
    paddingRight: 38,
  },
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
  listRow: {
    backgroundColor: "#f9f7f3",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: colors.fairway,
    fontSize: 12,
    fontWeight: "700",
  },
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
  selectedRow: {
    backgroundColor: colors.fairwaySoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  selectedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedAvatar: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  selectedText: { color: colors.text },
  removeIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
