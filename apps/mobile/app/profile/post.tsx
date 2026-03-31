import { useCallback, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPatch, apiPost } from "../../lib/api";
import { uploadImage, POST_MAX_BYTES } from "../../lib/upload-image";
import { colors } from "../../lib/theme";

const INPUT_MIN_H = 120;
const INPUT_MAX_H = 280;
const STICKY_TOOLBAR_CONTENT_H = 52;

export default function ProfilePostScreen() {
  const router = useRouter();
  const { editId, editBody, editImageUrl } = useLocalSearchParams<{
    editId?: string;
    editBody?: string;
    editImageUrl?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const isEditing = typeof editId === "string" && editId.length > 0;
  const [body, setBody] = useState(typeof editBody === "string" ? editBody : "");
  const [imageUri, setImageUri] = useState<string | null>(
    typeof editImageUrl === "string" ? editImageUrl : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const stickyOffset = useMemo(
    () => ({ opened: insets.bottom - 8 }),
    [insets.bottom],
  );

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo library access is needed to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
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
          filename: "profile-post-image.jpg",
          maxBytes: POST_MAX_BYTES,
          getToken: getTokenRef.current,
        });
        if (!uploaded) {
          setSubmitting(false);
          return;
        }
        imageUrl = uploaded;
      } else {
        imageUrl = undefined;
      }

      if (isEditing && editId) {
        await apiPatch(`/api/posts/${editId}`, { body: trimmed, imageUrl }, token);
      } else {
        await apiPost(
          "/api/posts",
          { body: trimmed, imageUrl, scope: "profile" },
          token,
        );
      }
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post.");
    } finally {
      setSubmitting(false);
    }
  }, [body, imageUri, router, editId, isEditing]);

  const canSubmit = body.trim().length > 0 && !submitting;

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={STICKY_TOOLBAR_CONTENT_H + 12}
      >
        <Text style={styles.title}>{isEditing ? "Edit post" : "Create a post"}</Text>

        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled
          maxLength={2000}
          autoFocus
          textAlignVertical="top"
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
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={stickyOffset}>
        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            style={styles.imageBtn}
            onPress={() => void pickImage()}
            accessibilityLabel="Attach image"
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={22} color={colors.fairway} />
          </Pressable>
          <View style={styles.toolbarSpacer} />
          <Pressable
            style={styles.cancel}
            onPress={() => router.back()}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.post, !canSubmit && styles.postDisabled]}
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
            accessibilityLabel="Post"
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postText}>Post</Text>
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
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
    textAlignVertical: "top",
    minHeight: INPUT_MIN_H,
    maxHeight: INPUT_MAX_H,
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  toolbarSpacer: {
    flex: 1,
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
