import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { apiPatch, apiPost } from "../../../lib/api";
import { SocialPostComposer } from "../../../components/social-post-composer";
import { emitGroupActivityEvent } from "../../../lib/group-activity-events";
import { useSnackbar } from "../../../lib/snackbar-context";
import { Alert } from "react-native";
import { useMemo, useRef } from "react";

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
  const { getToken } = useAuth();
  const { show: showSnackbar } = useSnackbar();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const isEditing = Boolean(editId);
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
  return (
    <SocialPostComposer
      title={isEditing ? "Edit post" : "Create a post"}
      placeholder="What's on your mind?"
      initialBody={editBody ?? ""}
      initialImageUris={initialImageUris}
      isEditing={isEditing}
      uploadFilename="post-image.jpg"
      onCancel={() => router.back()}
      onSubmit={async ({ body, imageUrls }) => {
        try {
          const token = await getTokenRef.current();
          if (isEditing && editId) {
            await apiPatch(
              `/api/groups/${groupId}/announcements`,
              { id: editId, body, imageUrls },
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
            }>(`/api/groups/${groupId}/announcements`, { body, imageUrls }, token);
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
          throw e;
        }
      }}
    />
  );
}
