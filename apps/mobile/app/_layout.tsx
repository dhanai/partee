import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { useEffect } from "react";
import { View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BuildConfigMissingScreen } from "../components/build-config-missing-screen";
import { ParfadeAppRealtimeGate } from "../components/parfade-app-realtime";
import { AblyChatProviders } from "../lib/ably-chat-context";
import { InAppToastProvider } from "../lib/in-app-toast-context";
import { NotificationBadgeProvider } from "../lib/notification-badge-context";
import { NotificationDeepLinkEffects } from "../lib/notification-deep-link";
import { colors } from "../lib/theme";

const CLERK_PUBLISHABLE_ENV = "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY";

void SplashScreen.preventAutoHideAsync();

function HideSplashOnMount() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return null;
}

/** Hides native splash once Clerk is ready (any initial route, including deep links). */
function ClerkLoadedSplashSync() {
  const { isLoaded } = useAuth();
  useEffect(() => {
    if (isLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [isLoaded]);
  return null;
}

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    if (__DEV__) {
      throw new Error(
        `Missing ${CLERK_PUBLISHABLE_ENV} in mobile env. For EAS builds, set project secrets and rebuild.`,
      );
    }
    return (
      <>
        <HideSplashOnMount />
        <BuildConfigMissingScreen missingEnv={CLERK_PUBLISHABLE_ENV} />
      </>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoadedSplashSync />
      <NotificationBadgeProvider>
        <InAppToastProvider>
          <AblyChatProviders>
            <KeyboardProvider>
              <ParfadeAppRealtimeGate />
              <NotificationDeepLinkEffects />
              <StatusBar style="dark" />
              <View style={{ flex: 1 }}>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="round/[token]"
              options={{
                title: "Round",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="round/[token]/edit"
              options={{
                title: "Edit Round",
                headerBackTitle: "Round",
              }}
            />
            <Stack.Screen
              name="round/[token]/chat"
              options={{
                title: "Group chat",
                headerBackTitle: "Round",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/index"
              options={{
                title: "Profile",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/followers"
              options={{
                title: "Followers",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/following"
              options={{
                title: "Following",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="profile/edit"
              options={{
                title: "Edit profile",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="notifications"
              options={{
                title: "Notifications",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                title: "Settings",
                headerBackTitle: "Back",
              }}
            />
            <Stack.Screen
              name="invite-friends"
              options={{
                title: "Invite Friends",
                headerBackTitle: "Back",
              }}
            />
                </Stack>
              </View>
            </KeyboardProvider>
          </AblyChatProviders>
        </InAppToastProvider>
      </NotificationBadgeProvider>
    </ClerkProvider>
  );
}
