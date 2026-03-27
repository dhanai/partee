import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useClerk } from "@clerk/clerk-expo";

import { apiPost, toAbsoluteUrl } from "../lib/api";
import { clearAllCaches } from "../lib/clear-all-caches";
import { InitialAvatar } from "./initial-avatar";
import { getCachedMeProfile, subscribeMeProfile } from "../lib/me-profile-cache";
import { colors } from "../lib/theme";
import { OverflowMenuSheet, type OverflowMenuItem } from "./overflow-menu-sheet";

/** Header chip is a circle (not the rounded-square used on full profile). */
const HEADER_IMG = 28;
const HEADER_IMG_R = HEADER_IMG / 2;
const HEADER_BTN = 30;
const HEADER_BTN_R = HEADER_BTN / 2;

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
      await clearAllCaches();
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
          <Image source={{ uri: toAbsoluteUrl(avatar) }} style={styles.avatar} transition={0} />
        ) : getCachedMeProfile()?.name ? (
          <InitialAvatar name={getCachedMeProfile()!.name} size={26} borderRadius={13} />
        ) : (
          <View style={styles.skeleton} />
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
    width: HEADER_BTN,
    height: HEADER_BTN,
    borderRadius: HEADER_BTN_R,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: {
    width: HEADER_IMG,
    height: HEADER_IMG,
    borderRadius: HEADER_IMG_R,
  },
  skeleton: {
    width: HEADER_IMG,
    height: HEADER_IMG,
    borderRadius: HEADER_IMG_R,
    backgroundColor: "#e5e3de",
  },
});
