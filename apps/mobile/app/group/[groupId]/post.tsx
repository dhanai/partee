import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPatch, apiPost } from "../../../lib/api";
import { uploadImage, POST_MAX_BYTES } from "../../../lib/upload-image";
import { colors } from "../../../lib/theme";

export default function GroupPostScreen() {
  const {
    groupId,
    editId,
    editBody,
    editImageUrl,
  } = useLocalSearchParams<{
    groupId: string;
    editId?: string;
    editBody?: string;
    editImageUrl?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const isEditing = Boolean(editId);
  const [body, setBody] = useState(editBody ?? "");
  const [imageUri, setImageUri] = useState<string | null>(editImageUrl ?? null);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo library access is needed to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const token = await getTokenRef.current();

      let imageUrl: string | null | undefined;
      if (imageUri && imageUri.startsWith("http")) {
        imageUrl = imageUri;
      } else if (imageUri) {
        const uploaded = await uploadImage({
          uri: imageUri,
          filename: "post-image.jpg",
          maxBytes: POST_MAX_BYTES,
          getToken: getTokenRef.current,
        });
        if (!uploaded) {
          setSubmitting(false);
          return;
        }
        imageUrl = uploaded;
      } else {
        imageUrl = isEditing ? null : undefined;
      }

      if (isEditing && editId) {
        await apiPatch(
          `/api/groups/${groupId}/announcements`,
          { id: editId, body: trimmed, imageUrl },
          token,
        );
      } else {
        await apiPost(
          `/api/groups/${groupId}/announcements`,
          { body: trimmed, imageUrl },
          token,
        );
      }
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post.");
    } finally {
      setSubmitting(false);
    }
  }, [body, imageUri, isEditing, editId, groupId, router]);

  const canSubmit = body.trim().length > 0 && !submitting;

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Text style={styles.title}>{isEditing ? "Edit post" : "Create a post"}</Text>

      <TextInput
        style={styles.input}
        value={body}
        onChangeText={setBody}
        placeholder="What's on your mind?"
        placeholderTextColor={colors.muted}
        multiline
        numberOfLines={4}
        maxLength={2000}
        autoFocus
      />

      {imageUri ? (
        <View style={styles.imagePreviewWrap}>
          <Image source={imageUri} style={styles.imagePreview} transition={0} />
          <Pressable
            style={styles.imageRemove}
            onPress={() => setImageUri(null)}
            hitSlop={6}
          >
            <Ionicons name="close-circle" size={22} color="rgba(0,0,0,0.7)" />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.imageBtn} onPress={() => void pickImage()}>
          <Ionicons name="image-outline" size={22} color={colors.fairway} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.cancel} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.post, !canSubmit && styles.postDisabled]}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postText}>{isEditing ? "Save" : "Post"}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  imagePreviewWrap: {
    marginTop: 10,
    position: "relative",
    alignSelf: "flex-start",
  },
  imagePreview: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.fairwaySoft,
  },
  imageRemove: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  imageBtn: {
    padding: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  cancel: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  post: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  postDisabled: { opacity: 0.5 },
  postText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
