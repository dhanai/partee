import { Redirect, router } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ParteeLogo } from "../../components/partee-logo";
import { colors } from "../../lib/theme";

export default function AuthWelcomeScreen() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <ParteeLogo />
        <Text style={styles.title}>Golf plans without the group text chaos.</Text>
        <Text style={styles.subtitle}>
          Create rounds, invite friends, and discover games nearby in seconds.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={() => router.push("/(auth)/sign-up")}>
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => router.push("/(auth)/sign-in")}>
          <Text style={styles.linkBtnText}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  hero: {
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
  },
  title: {
    color: colors.text,
    fontSize: 33,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  linkBtn: {
    paddingVertical: 6,
    alignItems: "center",
  },
  linkBtnText: {
    color: colors.fairway,
    fontWeight: "600",
  },
});
