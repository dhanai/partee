import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiPost } from "../lib/api";
import { useSnackbar } from "../lib/snackbar-context";
import { colors } from "../lib/theme";

const JOIN_POLICIES = [
  { value: "public" as const, label: "Public", desc: "Anyone can join" },
  { value: "approval" as const, label: "Private", desc: "Admin must approve" },
  { value: "invite_only" as const, label: "Invite only", desc: "Members by invitation" },
];

export default function CreateGroupScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const { show: showSnackbar } = useSnackbar();
  const nameInputRef = useRef<TextInput>(null);

  const [name, setName] = useState("");

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      nameInputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"public" | "approval" | "invite_only">("public");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a name for your group.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiPost<{ group: { id: string; conversationId: string } }>(
        "/api/groups",
        { name: trimmed, description: description.trim() || undefined, joinPolicy },
        token,
      );
      showSnackbar("Group created");
      router.replace({
        pathname: "/group/[groupId]",
        params: { groupId: data.group.id },
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create group.");
    } finally {
      setSubmitting(false);
    }
  }, [name, description, joinPolicy, router, showSnackbar]);

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
          ref={nameInputRef}
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Saturday Golf Crew"
          placeholderTextColor={colors.muted}
          maxLength={100}
        />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What's this group about?"
          placeholderTextColor={colors.muted}
          maxLength={500}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Who can join?</Text>
        <View style={styles.policyList}>
          {JOIN_POLICIES.map((p) => (
            <Pressable
              key={p.value}
              style={[
                styles.policyRow,
                joinPolicy === p.value && styles.policyRowActive,
              ]}
              onPress={() => setJoinPolicy(p.value)}
            >
              <View style={styles.policyRadio}>
                {joinPolicy === p.value ? (
                  <View style={styles.policyRadioInner} />
                ) : null}
              </View>
              <View style={styles.policyText}>
                <Text style={styles.policyLabel}>{p.label}</Text>
                <Text style={styles.policyDesc}>{p.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.createBtn, submitting && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create Group</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  policyList: { gap: 8, marginTop: 4 },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  policyRowActive: {
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
  },
  policyRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  policyRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.fairway,
  },
  policyText: { flex: 1, gap: 2 },
  policyLabel: { color: colors.text, fontWeight: "600", fontSize: 15 },
  policyDesc: { color: colors.muted, fontSize: 13 },
  createBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
