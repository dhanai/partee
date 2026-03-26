import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthLandingBackground } from "../../components/auth-landing-background";
import { ParfadeLogo } from "../../components/parfade-logo";
import { AUTH_LOGO_EXTRA_TOP } from "../../lib/auth-form-styles";

WebBrowser.maybeCompleteAuthSession();

export default function AuthWelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <AuthLandingBackground style={styles.gradient}>
        <StatusBar style="light" />
        <View style={[styles.splash, { paddingTop: insets.top }]}>
          <ActivityIndicator color="#f4f1ea" size="large" />
        </View>
      </AuthLandingBackground>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <AuthLandingBackground style={styles.gradient}>
      <StatusBar style="light" />
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 20) + 8,
          },
        ]}
      >
        <View style={styles.bottomStack}>
          <View style={styles.heroBlock}>
            <ParfadeLogo tone="light" size="large" />
            <Text style={styles.title}>Golf plans without the group text chaos.</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
              onPress={() => router.push("/(auth)/sign-up")}
            >
              <Text style={styles.primaryBtnText}>Get started</Text>
            </Pressable>
            <Pressable
              style={styles.signInRow}
              onPress={() => router.push("/(auth)/sign-in")}
            >
              <Text style={styles.signInText}>Already have an account? </Text>
              <Text style={styles.signInLink}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AuthLandingBackground>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, paddingHorizontal: 22 },
  bottomStack: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "stretch",
    gap: 22,
    width: "100%",
    paddingBottom: 4,
  },
  heroBlock: {
    alignItems: "flex-start",
    gap: 14,
    width: "100%",
    paddingTop: AUTH_LOGO_EXTRA_TOP,
  },
  title: {
    color: "#f8f6f1",
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "500",
    letterSpacing: -0.85,
    textAlign: "left",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  actions: { width: "100%", gap: 14 },
  primaryBtn: {
    backgroundColor: "#f4f1ea",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  primaryBtnText: {
    color: "#0f2418",
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 4,
  },
  signInText: { color: "rgba(244,241,234,0.7)", fontSize: 15, fontWeight: "500" },
  signInLink: { color: "#f4f1ea", fontSize: 15, fontWeight: "700" },
});
