import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useClerk } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { apiPost } from "../lib/api";
import { getCachedMeProfile, subscribeMeProfile } from "../lib/me-profile-cache";
import { colors } from "../lib/theme";
import { OverflowMenuSheet, type OverflowMenuItem } from "./overflow-menu-sheet";

export function HeaderProfileIcon() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [avatar, setAvatar] = useState<string | null>(
    getCachedMeProfile()?.avatar ?? null,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const cached = getCachedMeProfile()?.avatar ?? null;
    if (cached && cached !== avatar) setAvatar(cached);

    return subscribeMeProfile((profile) => {
      setAvatar(profile.avatar ?? null);
    });
  }, []);

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuOpen(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        try {
          await apiPost("/api/users/me/push-token", { expoPushToken: null }, token);
        } catch {
          // best-effort
        }
      }
      await signOut();
      router.replace("/(auth)");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Couldn't sign out.");
    }
  }, [getToken, signOut, router]);

  const menuItems: OverflowMenuItem[] = useMemo(
    () => [
      {
        key: "settings",
        label: "Settings",
        icon: "settings-outline",
        onPress: () => router.push("/settings"),
      },
      {
        key: "sign-out",
        label: "Sign out",
        icon: "log-out-outline",
        destructive: true,
        onPress: () => void handleSignOut(),
      },
    ],
    [router, handleSignOut],
  );

  return (
    <>
      <Pressable
        style={styles.btn}
        onPress={() => router.push("/(tabs)/profile")}
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessibilityLabel="Open profile"
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <Ionicons name="person-circle-outline" size={26} color={colors.fairway} />
        )}
      </Pressable>
      <OverflowMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
