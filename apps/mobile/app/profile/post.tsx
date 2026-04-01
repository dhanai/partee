import { useMemo, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Alert } from "react-native";
import { apiPatch, apiPost } from "../../lib/api";
import { SocialPostComposer } from "../../components/social-post-composer";
import { getCachedMeProfile } from "../../lib/me-profile-cache";
import { emitProfileActivityEvent } from "../../lib/profile-activity-events";
import { useSnackbar } from "../../lib/snackbar-context";

export default function ProfilePostScreen() {
  const router = useRouter();
  const {
    editId,
    editBody,
    editImageUrl,
    editImageUrls,
    profileUserId,
    targetFirstName: rawTargetFirstName,
  } =
    useLocalSearchParams<{
    editId?: string;
    editBody?: string;
    editImageUrl?: string;
    editImageUrls?: string;
    profileUserId?: string;
    targetFirstName?: string;
  }>();
  const targetFirstName =
    typeof rawTargetFirstName === "string" ? rawTargetFirstName.trim() : "";
  const { getToken } = useAuth();
  const { show: showSnackbar } = useSnackbar();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const isEditing = typeof editId === "string" && editId.length > 0;
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
    return typeof editImageUrl === "string" && editImageUrl.length > 0 ? [editImageUrl] : [];
  }, [editImageUrl, editImageUrls]);
  return (
    <SocialPostComposer
      title={isEditing ? "Edit post" : "Create a post"}
      placeholder={
        targetFirstName ? `Write something to ${targetFirstName}...` : "What's on your mind?"
      }
      initialBody={typeof editBody === "string" ? editBody : ""}
      initialImageUris={initialImageUris}
      isEditing={isEditing}
      uploadFilename="profile-post-image.jpg"
      onCancel={() => router.back()}
      onSubmit={async ({ body, imageUrls }) => {
        try {
          const token = await getTokenRef.current();
          const defaultProfileUserId =
            typeof profileUserId === "string" && profileUserId.length > 0
              ? profileUserId
              : (getCachedMeProfile()?.id ?? null);
          if (isEditing && editId) {
            await apiPatch(`/api/posts/${editId}`, { body, imageUrls }, token);
            emitProfileActivityEvent({
              profileUserId: defaultProfileUserId,
              action: "updated",
            });
            showSnackbar("Post updated");
          } else {
            const result = await apiPost<{
              post?: {
                id: string;
                body: string;
                imageUrl: string | null;
                imageUrls?: string[];
                createdAt: string;
                isPinned?: boolean;
                profileUserId?: string | null;
                user: { id: string; name: string; avatar: string | null };
              };
            }>(
              "/api/posts",
              {
                body,
                imageUrls,
                scope: "profile",
                ...(typeof profileUserId === "string" && profileUserId.length > 0
                  ? { profileUserId }
                  : {}),
              },
              token,
            );
            if (result.post) {
              emitProfileActivityEvent({
                profileUserId: result.post.profileUserId ?? defaultProfileUserId,
                action: "created",
                post: {
                  ...result.post,
                  likeCount: 0,
                  commentCount: 0,
                  viewerLiked: false,
                },
              });
            } else {
              emitProfileActivityEvent({
                profileUserId: defaultProfileUserId,
                action: "created",
              });
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
