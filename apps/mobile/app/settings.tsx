import { useNavigation } from "@react-navigation/native";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { colors } from "../lib/theme";

type MeResponse = {
  user: {
    followVisibility?: "public" | "private";
    hideHostedRoundsFromDiscover?: boolean;
  };
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [followVisibility, setFollowVisibility] = useState<"public" | "private">("public");
  const [hideHostedFromDiscover, setHideHostedFromDiscover] = useState(false);
  const [savingDiscover, setSavingDiscover] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<MeResponse>("/api/users/me", token);
        if (!active) return;
        setFollowVisibility(json.user.followVisibility ?? "public");
        setHideHostedFromDiscover(json.user.hideHostedRoundsFromDiscover ?? false);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load settings.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const savingAny = saving || savingDiscover;

  useLayoutEffect(() => {
    const show = !loading && (savingAny || saveNote != null);
    const label = savingAny ? "Saving…" : (saveNote ?? "");
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
  }, [navigation, loading, savingAny, saveNote]);

  async function saveFollowVisibility(next: "public" | "private") {
    const previous = followVisibility;
    setSaving(true);
    setError(null);
    setSaveNote(null);
    setFollowVisibility(next);
    try {
      const token = await getTokenRef.current();
      await apiPatch("/api/users/me", { followVisibility: next }, token);
      setSaveNote("Saved");
    } catch (saveError) {
      setFollowVisibility(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
      setSaveNote("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveHideHostedFromDiscover(next: boolean) {
    const previous = hideHostedFromDiscover;
    setSavingDiscover(true);
    setError(null);
    setSaveNote(null);
    setHideHostedFromDiscover(next);
    try {
      const token = await getTokenRef.current();
      await apiPatch("/api/users/me", { hideHostedRoundsFromDiscover: next }, token);
      setSaveNote("Saved");
    } catch (saveError) {
      setHideHostedFromDiscover(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
      setSaveNote("Save failed");
    } finally {
      setSavingDiscover(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      if (token) {
        try {
          await apiPost("/api/users/me/push-token", { expoPushToken: null }, token);
        } catch {
          // Best-effort: still sign out if the session or network fails.
        }
      }
      await signOut();
      // Settings sits on the root stack above (tabs); tabs' Redirect does not unmount this screen.
      router.dismissAll();
      router.replace("/(auth)");
    } catch (signOutErr) {
      setError(signOutErr instanceof Error ? signOutErr.message : "Couldn't sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Privacy</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Make my profile private</Text>
              <Switch
                value={followVisibility === "private"}
                onValueChange={(v) => void saveFollowVisibility(v ? "private" : "public")}
                disabled={saving || savingDiscover}
                trackColor={{ false: "#ece8e1", true: colors.fairwaySoft }}
                thumbColor={followVisibility === "private" ? colors.fairway : "#f4f3f4"}
                ios_backgroundColor="#ece8e1"
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Discover</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Hide my hosted rounds on my Discover</Text>
              <Switch
                value={hideHostedFromDiscover}
                onValueChange={(v) => void saveHideHostedFromDiscover(v)}
                disabled={savingDiscover || saving}
                trackColor={{ false: "#ece8e1", true: colors.fairwaySoft }}
                thumbColor={hideHostedFromDiscover ? colors.fairway : "#f4f3f4"}
                ios_backgroundColor="#ece8e1"
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.signOutButton, signingOut && styles.disabled]}
            onPress={() => void handleSignOut()}
            disabled={signingOut}
          >
            <Text style={styles.signOutText}>{signingOut ? "Signing out..." : "Sign out"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: colors.surface,
  },
  cardTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  switchLabel: {
    flex: 1,
    color: colors.text,
    fontWeight: "400",
    fontSize: 14,
  },
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
  error: { color: colors.danger },
  signOutButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  signOutText: { color: colors.text, fontWeight: "700" },
  disabled: { opacity: 0.6 },
});
