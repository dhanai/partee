import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiBaseUrl, apiGet, apiPatch, apiPost, toAbsoluteUrl } from "../../lib/api";
import {
  compressImageToJpegUriForUpload,
  compressImageToMaxBytes,
} from "../../lib/compress-image-for-upload";
import { getCachedMeProfile, setCachedMeProfile } from "../../lib/me-profile-cache";
import { colors } from "../../lib/theme";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
    handicap: string | null;
    location: string | null;
    homeCourse: string | null;
    followersCount?: number;
    followingCount?: number;
  };
};

type LocationResult = { label: string; city: string; state: string };

type EditableProfileFields = {
  name: string;
  handicap: string;
  location: string;
  avatar: string | null;
};

function snapshotFromFields(fields: EditableProfileFields) {
  return JSON.stringify({
    name: fields.name.trim(),
    handicap: fields.handicap.trim(),
    location: fields.location.trim(),
    avatar: fields.avatar ?? null,
  });
}

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const cachedMe = useMemo(() => getCachedMeProfile(), []);
  const [loading, setLoading] = useState(!cachedMe);
  const [meId, setMeId] = useState(cachedMe?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [name, setName] = useState(cachedMe?.name ?? "");
  const [email, setEmail] = useState(cachedMe?.email ?? "");
  const [handicap, setHandicap] = useState(cachedMe?.handicap ?? "");
  const [location, setLocation] = useState(cachedMe?.location ?? cachedMe?.homeCourse ?? "");
  const [locationIsValidated, setLocationIsValidated] = useState(true);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(cachedMe?.avatar ?? null);
  const debouncedLocation = useDebounce(location, 320);
  const lastSavedSnapshotRef = useRef(
    snapshotFromFields({
      name: cachedMe?.name ?? "",
      handicap: cachedMe?.handicap ?? "",
      location: cachedMe?.location ?? cachedMe?.homeCourse ?? "",
      avatar: cachedMe?.avatar ?? null,
    }),
  );

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useLayoutEffect(() => {
    const show = !loading && !uploading && (profileSaving || saveNote != null);
    const label = profileSaving ? "Saving…" : (saveNote ?? "");
    const pill = (
      <View style={styles.headerSavePill}>
        <Text style={styles.headerSavePillText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );

    if (Platform.OS === "ios") {
      navigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: { paddingRight: 6 },
        unstable_headerRightItems: show
          ? () => [
              {
                type: "custom" as const,
                element: pill,
                hidesSharedBackground: true,
              },
            ]
          : () => [],
      });
    } else {
      navigation.setOptions({
        unstable_headerRightItems: undefined,
        headerRightContainerStyle: { paddingRight: 10, justifyContent: "center" },
        headerRight: () => (show ? pill : null),
      });
    }
  }, [navigation, loading, uploading, profileSaving, saveNote]);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<MeResponse>("/api/users/me", token);
        if (!active) return;
        setCachedMeProfile(json.user);
        setMeId(json.user.id);
        setName(json.user.name ?? "");
        setEmail(json.user.email ?? "");
        setHandicap(json.user.handicap ?? "");
        const existingLocation = json.user.location ?? json.user.homeCourse ?? "";
        setLocation(existingLocation);
        setLocationIsValidated(existingLocation.trim().length > 0);
        setAvatar(json.user.avatar ?? null);
        lastSavedSnapshotRef.current = snapshotFromFields({
          name: json.user.name ?? "",
          handicap: json.user.handicap ?? "",
          location: existingLocation,
          avatar: json.user.avatar ?? null,
        });
      } catch (profileError) {
        if (!active) return;
        setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

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
    try {
      const token = await getTokenRef.current();
      const asset = result.assets[0];
      const maxBytes = 3 * 1024 * 1024;
      const formData = new FormData();
      if (Platform.OS === "web") {
        const imageBlob = await compressImageToMaxBytes(
          asset.uri,
          maxBytes,
          asset.width,
          asset.height,
        );
        if (imageBlob.size > maxBytes) {
          throw new Error("Could not reduce photo under 3 MB. Try a different image.");
        }
        formData.append("file", imageBlob, "profile-image.jpg");
      } else {
        const fileUri = await compressImageToJpegUriForUpload(
          asset.uri,
          maxBytes,
          asset.width,
          asset.height,
        );
        const sizeCheck = await (await fetch(fileUri)).blob();
        if (sizeCheck.size > maxBytes) {
          throw new Error("Could not reduce photo under 3 MB. Try a different image.");
        }
        formData.append("file", {
          uri: fileUri,
          name: "profile-image.jpg",
          type: "image/jpeg",
        } as unknown as Blob);
      }

      const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const bodyText = await response.text();
      let json: { url?: string; error?: string } = {};
      try {
        json = JSON.parse(bodyText) as { url?: string; error?: string };
      } catch {
        throw new Error(`Image upload failed (${response.status}).`);
      }
      if (!response.ok || !json.url) {
        throw new Error(
          json.error ?? `Image upload failed (HTTP ${response.status}).`,
        );
      }
      setAvatar(json.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function runLocationSearch() {
      if (locationIsValidated) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
          setLocationLoading(false);
        }
        return;
      }
      const query = debouncedLocation.trim();
      if (query.length < 2) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
        }
        return;
      }
      setLocationLoading(true);
      try {
        const token = await getTokenRef.current();
        const json = await apiPost<{ locations: LocationResult[] }>(
          "/api/locations/search",
          { query },
          token,
        );
        if (!active) return;
        setLocationResults(json.locations);
        setShowLocationResults(true);
      } catch {
        if (!active) return;
      } finally {
        if (active) setLocationLoading(false);
      }
    }
    void runLocationSearch();
    return () => {
      active = false;
    };
  }, [debouncedLocation, locationIsValidated]);

  useEffect(() => {
    if (loading || uploading) return;
    const nextSnapshot = snapshotFromFields({ name, handicap, location, avatar });
    if (nextSnapshot === lastSavedSnapshotRef.current) return;
    if (location.trim().length > 0 && !locationIsValidated) {
      setSaveNote(null);
      setProfileSaving(false);
      return;
    }
    setSaveNote(null);
    const timer = setTimeout(async () => {
      setError(null);
      setProfileSaving(true);
      try {
        const token = await getTokenRef.current();
        await apiPatch<MeResponse>(
          "/api/users/me",
          {
            name: name.trim(),
            handicap: handicap.trim() || null,
            location: location.trim() || null,
            avatar: avatar ?? null,
          },
          token,
        );
        const savedSnapshot = snapshotFromFields({ name, handicap, location, avatar });
        lastSavedSnapshotRef.current = savedSnapshot;
        setCachedMeProfile({
          id: meId || cachedMe?.id || "me",
          name: name.trim(),
          email: email.trim() || null,
          handicap: handicap.trim() || null,
          location: location.trim() || null,
          homeCourse: location.trim() || null,
          avatar: avatar ?? null,
          followersCount: cachedMe?.followersCount,
          followingCount: cachedMe?.followingCount,
        });
        setProfileSaving(false);
        setSaveNote("Saved");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to auto-save profile.");
        setProfileSaving(false);
        setSaveNote("Save failed");
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [
    loading,
    uploading,
    name,
    handicap,
    location,
    avatar,
    locationIsValidated,
    meId,
    cachedMe?.id,
    email,
  ]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
          {/*
            Avatar tap target: visuals use pointerEvents="none" so they don't steal touches from
            TouchableOpacity — but if *all* children opt out, iOS can collapse the touchable's hit
            rect (only the camera badge seemed tappable). A nearly-invisible full-bleed layer on top
            restores a reliable hit surface. If iOS Simulator still flakes, verify on device; see TODO below.
          */}
          <TouchableOpacity
            style={[styles.avatarWrap, uploading && styles.disabled]}
            activeOpacity={0.88}
            delayPressIn={0}
            onPress={() => void handleUploadAvatar()}
            disabled={uploading}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
          >
            {avatar ? (
              <View style={styles.avatar} pointerEvents="none">
                <Image
                  source={{ uri: toAbsoluteUrl(avatar) }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View
                style={[styles.avatar, styles.avatarPlaceholder]}
                pointerEvents="none"
              >
                <Text style={styles.avatarInitial}>P</Text>
              </View>
            )}
            <View style={styles.avatarCameraBadge} pointerEvents="none">
              <Ionicons
                name={uploading ? "hourglass-outline" : "camera-outline"}
                size={18}
                color={colors.text}
              />
            </View>
            {/* default pointerEvents — participates in layout so the touchable keeps a full 104×104 rect */}
            <View style={styles.avatarHitCatcher} collapsable={false} />
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={email}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.disabledInput]}
            editable={false}
            selectTextOnFocus={false}
          />

          <Text style={styles.fieldLabel}>Handicap index</Text>
          <TextInput
            value={handicap}
            onChangeText={setHandicap}
            keyboardType="decimal-pad"
            placeholder="Handicap index"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            value={location}
            onChangeText={(value) => {
              setLocation(value);
              setLocationIsValidated(false);
            }}
            onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
            placeholder="City, State"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {locationLoading ? <Text style={styles.hint}>Searching locations...</Text> : null}
          {showLocationResults &&
            locationResults.map((item) => (
              <Pressable
                key={item.label}
                style={styles.listRow}
                onPress={() => {
                  setLocation(item.label);
                  setLocationIsValidated(true);
                  setLocationResults([]);
                  setShowLocationResults(false);
                }}
              >
                <Text style={styles.listTitle}>{item.label}</Text>
              </Pressable>
            ))}
          {!locationIsValidated && location.trim().length > 0 ? (
            <Text style={styles.hint}>Select a suggested city/state.</Text>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  headerSavePill: {
    alignSelf: "center",
    backgroundColor: colors.fairwaySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: 120,
  },
  headerSavePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.fairway,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: colors.surface,
  },
  avatarWrap: {
    alignSelf: "center",
    width: 104,
    height: 104,
    position: "relative",
    marginBottom: 2,
    borderRadius: 999,
    /* overflow hidden on the touchable can break hit testing on iOS; clip on inner .avatar */
  },
  /** Full-bleed touch surface above visuals (opaque to hits, ~invisible). */
  avatarHitCatcher: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#dfe6df",
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  avatarInitial: { color: colors.fairway, fontWeight: "700", fontSize: 18 },
  fieldLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#ece8e1",
  },
  disabledInput: {
    color: colors.muted,
    backgroundColor: "#f5f3ef",
  },
  avatarCameraBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#ece8e1",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  listRow: {
    backgroundColor: "#f9f7f3",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listTitle: { color: colors.text, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 12 },
  errorText: { color: colors.danger },
  disabled: { opacity: 0.6 },
});
