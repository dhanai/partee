import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiDelete, apiGet, apiPatch } from "../../../lib/api";
import { colors } from "../../../lib/theme";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  joinPolicy: "public" | "approval" | "invite_only";
  myRole: "owner" | "admin" | "member" | null;
};

const JOIN_POLICIES = [
  { value: "public" as const, label: "Public" },
  { value: "approval" as const, label: "Approval" },
  { value: "invite_only" as const, label: "Invite only" },
];

export default function GroupSettingsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"public" | "approval" | "invite_only">("public");
  const [myRole, setMyRole] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await apiGet<{ group: GroupDetail }>(
          `/api/groups/${groupId}`,
          token,
        );
        setName(data.group.name);
        setDescription(data.group.description ?? "");
        setJoinPolicy(data.group.joinPolicy);
        setMyRole(data.group.myRole);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a name for your group.");
      return;
    }
    setSaving(true);
    try {
      const token = await getTokenRef.current();
      await apiPatch(
        `/api/groups/${groupId}`,
        { name: trimmed, description: description.trim() || null, joinPolicy },
        token,
      );
      Alert.alert("Saved", "Group settings updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }, [groupId, name, description, joinPolicy]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete group",
      "This will permanently delete the group and all its data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getTokenRef.current();
              await apiDelete(`/api/groups/${groupId}`, token);
              if (router.canGoBack()) {
                router.dismissAll();
              } else {
                router.replace("/(tabs)/groups");
              }
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
            }
          },
        },
      ],
    );
  }, [groupId, router]);

  const handleLeave = useCallback(() => {
    Alert.alert("Leave group", "Are you sure you want to leave?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getTokenRef.current();
            await apiDelete(`/api/groups/${groupId}/members`, token);
            if (router.canGoBack()) {
              router.dismissAll();
            } else {
              router.replace("/(tabs)/groups");
            }
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not leave.");
          }
        },
      },
    ]);
  }, [groupId, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Group name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={100}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Who can join?</Text>
        <View style={styles.policyRow}>
          {JOIN_POLICIES.map((p) => (
            <Pressable
              key={p.value}
              style={[
                styles.policyChip,
                joinPolicy === p.value && styles.policyChipActive,
              ]}
              onPress={() => setJoinPolicy(p.value)}
            >
              <Text
                style={[
                  styles.policyChipText,
                  joinPolicy === p.value && styles.policyChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>

        <View style={styles.dangerZone}>
          {myRole !== "owner" ? (
            <Pressable style={styles.dangerBtn} onPress={handleLeave}>
              <Text style={styles.dangerBtnText}>Leave group</Text>
            </Pressable>
          ) : null}
          {myRole === "owner" ? (
            <Pressable style={styles.dangerBtn} onPress={handleDelete}>
              <Text style={styles.dangerBtnText}>Delete group</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: { padding: 20, gap: 6, paddingBottom: 60 },
  label: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  policyRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  policyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  policyChipActive: {
    backgroundColor: colors.fairway,
    borderColor: colors.fairway,
  },
  policyChipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  policyChipTextActive: { color: "#fff" },
  saveBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dangerZone: { marginTop: 40, gap: 12 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerBtnText: { color: colors.danger, fontWeight: "600", fontSize: 15 },
});
