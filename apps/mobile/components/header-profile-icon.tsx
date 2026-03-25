import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getCachedMeProfile, subscribeMeProfile } from "../lib/me-profile-cache";
import { colors } from "../lib/theme";

export function HeaderProfileIcon() {
  const router = useRouter();
  const [avatar, setAvatar] = useState<string | null>(
    getCachedMeProfile()?.avatar ?? null,
  );

  useEffect(() => {
    const cached = getCachedMeProfile()?.avatar ?? null;
    if (cached && cached !== avatar) setAvatar(cached);

    return subscribeMeProfile((profile) => {
      setAvatar(profile.avatar ?? null);
    });
  }, []);

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push("/(tabs)/profile")}
      accessibilityLabel="Open profile"
    >
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} />
      ) : (
        <Ionicons name="person-circle-outline" size={26} color={colors.fairway} />
      )}
    </Pressable>
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
