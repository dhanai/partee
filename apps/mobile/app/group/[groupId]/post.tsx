import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPatch, apiPost } from "../../../lib/api";
import { emitGroupActivityEvent } from "../../../lib/group-activity-events";
import { useSnackbar } from "../../../lib/snackbar-context";
import { uploadImage, POST_MAX_BYTES } from "../../../lib/upload-image";
import { colors } from "../../../lib/theme";

/** Min / max height use native multiline sizing (no controlled `height`) to avoid measure ↔ state flicker. */
const INPUT_MIN_H = 120;
const INPUT_MAX_H = 280;
/** Extra space when scrolling so caret clears the sticky toolbar above the keyboard */
const STICKY_TOOLBAR_CONTENT_H = 52;

export default function GroupPostScreen() {
  const {
    groupId,
    editId,
    editBody,
    editImageUrl,
    editImageUrls,
  } = useLocalSearchParams<{
    groupId: string;
    editId?: string;
    editBody?: string;
    editImageUrl?: string;
    editImageUrls?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { show: showSnackbar } = useSnackbar();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const isEditing = Boolean(editId);
  const [body, setBody] = useState(editBody ?? "");
  const initialImageUris = useMemo(() => {
    const fromJson = (() => {
      if (!editImageUrls) return [];
      try {
        const parsed = JSON.parse(editImageUrls);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((value) => String(value)).filter((value) => value.trim().length > 0);
      } catch {
        return [];
      }
    })();
    if (fromJson.length > 0) return fromJson;
    return editImageUrl ? [editImageUrl] : [];
  }, [editImageUrl, editImageUrls]);
  const [imageUris, setImageUris] = useState<string[]>(initialImageUris);
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
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled) {
      const next = result.assets.map((asset) => asset.uri).filter((uri) => uri?.length > 0);
      if (next.length > 0) {
        setImageUris((prev) => [...prev, ...next].slice(0, 10));
      }
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const token = await getTokenRef.current();

      const uploadedImageUrls: string[] = [];
      for (const uri of imageUris) {
        if (uri.startsWith("http")) {
          uploadedImageUrls.push(uri);
          continue;
        }
        const uploaded = await uploadImage({
          uri,
          filename: "post-image.jpg",
          maxBytes: POST_MAX_BYTES,
          getToken: getTokenRef.current,
        });
        if (!uploaded) {
          setSubmitting(false);
          return;
        }
        uploadedImageUrls.push(uploaded);
      }

      if (isEditing && editId) {
        await apiPatch(
          `/api/groups/${groupId}/announcements`,
          { id: editId, body: trimmed, imageUrls: uploadedImageUrls },
          token,
        );
        emitGroupActivityEvent({
          groupId,
          action: "updated",
          postId: editId,
        });
        showSnackbar("Post updated");
      } else {
        const result = await apiPost<{
          announcement?: {
            id: string;
            body: string;
            imageUrl: string | null;
            imageUrls?: string[];
            isPinned: boolean;
            createdAt: string;
            user: { id: string; name: string; avatar: string | null };
          };
        }>(
          `/api/groups/${groupId}/announcements`,
          { body: trimmed, imageUrls: uploadedImageUrls },
          token,
        );
        if (result.announcement) {
          emitGroupActivityEvent({
            groupId,
            action: "created",
            postId: result.announcement.id,
            post: result.announcement,
          });
        } else {
          emitGroupActivityEvent({ groupId, action: "created" });
        }
        showSnackbar("Posted");
      }
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post.");
    } finally {
      setSubmitting(false);
    }
  }, [body, imageUris, isEditing, editId, groupId, router, showSnackbar]);

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

        {imageUris.length > 0 ? (
          <View style={styles.imagePreviewWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {imageUris.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.previewItem}>
                  <Image source={uri} style={styles.imagePreview} transition={0} />
                  <Pressable
                    style={styles.imageRemove}
                    onPress={() => setImageUris((prev) => prev.filter((_, i) => i !== index))}
                    hitSlop={6}
                  >
                    <Ionicons name="close-circle" size={22} color="rgba(0,0,0,0.7)" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
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
            accessibilityLabel={isEditing ? "Save post" : "Post"}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postText}>{isEditing ? "Save" : "Post"}</Text>
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
    alignSelf: "stretch",
  },
  previewItem: {
    marginRight: 10,
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
