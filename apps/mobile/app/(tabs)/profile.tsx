import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiBaseUrl, apiGet, apiPatch, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
    handicap: string | null;
    homeCourse: string | null;
  };
};

export default function ProfileScreen() {
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const hasLoadedOnceRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [handicap, setHandicap] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  const initials = useMemo(() => {
    if (!name.trim()) return "P";
    return name
      .trim()
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [name]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const json = await apiGet<MeResponse>("/api/users/me", token);
      setName(json.user.name ?? "");
      setEmail(json.user.email ?? "");
      setHandicap(json.user.handicap ?? "");
      setHomeCourse(json.user.homeCourse ?? "");
      setAvatar(json.user.avatar ?? null);
    } catch (profileError) {
      setError(
        profileError instanceof Error ? profileError.message : "Unable to load profile.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasLoadedOnceRef.current) return;
    hasLoadedOnceRef.current = true;
    void loadProfile();
  }, []);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo permission is required to upload your profile image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      const asset = result.assets[0];
      const imageResponse = await fetch(asset.uri);
      const imageBlob = await imageResponse.blob();
      const formData = new FormData();
      formData.append("file", imageBlob, "profile-image.jpg");

      const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      const json = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        throw new Error(json.error ?? "Image upload failed.");
      }
      setAvatar(json.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      await apiPatch<MeResponse>(
        "/api/users/me",
        {
          name: name.trim(),
          email: email.trim() || null,
          handicap: handicap.trim() || null,
          homeCourse: homeCourse.trim() || null,
          avatar: avatar ?? null,
        },
        token,
      );
      setSuccess("Profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            {avatar ? (
              <Image source={{ uri: toAbsoluteUrl(avatar) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarActions}>
              <Text style={styles.sectionLabel}>Photo</Text>
              <Pressable
                style={[styles.secondaryButton, uploading && styles.buttonDisabled]}
                onPress={() => void handleUploadAvatar()}
                disabled={uploading}
              >
                <Text style={styles.secondaryButtonText}>
                  {uploading ? "Uploading..." : avatar ? "Change photo" : "Upload photo"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>Handicap index</Text>
          <TextInput
            value={handicap}
            onChangeText={setHandicap}
            keyboardType="decimal-pad"
            placeholder="8.4"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>Location / home course</Text>
          <TextInput
            value={homeCourse}
            onChangeText={setHomeCourse}
            placeholder="Austin, TX or your home course"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}

          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            <Text style={styles.buttonText}>{saving ? "Saving..." : "Save profile"}</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={[styles.signOutButton, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={() => void handleSignOut()}
      >
        <Text style={styles.signOutText}>{busy ? "Signing out..." : "Sign out"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: "#dfe6df",
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  avatarInitials: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 20,
  },
  avatarActions: { flex: 1, gap: 6 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
  },
  secondaryButton: {
    backgroundColor: "#ece8e1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  errorText: { color: colors.danger },
  successText: { color: colors.fairway, fontWeight: "600" },
  button: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  signOutText: { color: colors.text, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
});
