import { useEffect, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { colors } from "../lib/theme";

type MeResponse = {
  user: {
    followVisibility?: "public" | "private";
  };
};

export default function SettingsScreen() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [followVisibility, setFollowVisibility] = useState<"public" | "private">("public");
  const [message, setMessage] = useState<string | null>(null);
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

  async function saveFollowVisibility(next: "public" | "private") {
    const previous = followVisibility;
    setSaving(true);
    setError(null);
    setMessage(null);
    setFollowVisibility(next);
    try {
      const token = await getTokenRef.current();
      await apiPatch("/api/users/me", { followVisibility: next }, token);
      setMessage("Settings updated.");
    } catch (saveError) {
      setFollowVisibility(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setSaving(false);
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
            <Text style={styles.cardHint}>Control who can follow you.</Text>
            <View style={styles.row}>
              <Pressable
                style={[
                  styles.pill,
                  followVisibility === "public" && styles.pillActive,
                  saving && styles.disabled,
                ]}
                onPress={() => void saveFollowVisibility("public")}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.pillText,
                    followVisibility === "public" && styles.pillTextActive,
                  ]}
                >
                  Public
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.pill,
                  followVisibility === "private" && styles.pillActive,
                  saving && styles.disabled,
                ]}
                onPress={() => void saveFollowVisibility("private")}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.pillText,
                    followVisibility === "private" && styles.pillTextActive,
                  ]}
                >
                  Private
                </Text>
              </Pressable>
            </View>
            {saving ? <Text style={styles.hint}>Saving...</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

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
  cardHint: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: { backgroundColor: colors.fairway },
  pillText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  pillTextActive: { color: "#fff" },
  hint: { color: colors.muted, fontSize: 12 },
  success: { color: colors.fairway, fontWeight: "600" },
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
