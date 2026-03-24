import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ClerkProvider, useAuth, useClerk } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { useEffect } from "react";
import { View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BuildConfigMissingScreen } from "../components/build-config-missing-screen";
import { ParfadeAppRealtimeGate } from "../components/parfade-app-realtime";
import { AblyChatProviders } from "../lib/ably-chat-context";
import { InAppToastProvider } from "../lib/in-app-toast-context";
import { ChatUnreadProvider } from "../lib/chat-unread-context";
import { NotificationBadgeProvider } from "../lib/notification-badge-context";
import { NotificationDeepLinkEffects } from "../lib/notification-deep-link";
import { setApiSessionInvalidHandler } from "../lib/api-session-invalid";
import { clearCachedMeProfile } from "../lib/me-profile-cache";
import { initializeParfadeMobileAds } from "../lib/parfade-admob";
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

function ParfadeMobileAdsBootstrap() {
  useEffect(() => {
    initializeParfadeMobileAds();
  }, []);
  return null;
}

/** API returned 401 with a Bearer token — sign out so we don’t spin (Clerk can stay “signed in”). */
function ApiSessionInvalidBridge() {
  const { signOut } = useClerk();
  useEffect(() => {
    setApiSessionInvalidHandler(async () => {
      clearCachedMeProfile();
      await signOut();
    });
    return () => setApiSessionInvalidHandler(null);
  }, [signOut]);
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
      <ParfadeMobileAdsBootstrap />
      <ClerkLoadedSplashSync />
      <ApiSessionInvalidBridge />
      <NotificationBadgeProvider>
        <ChatUnreadProvider>
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
              name="round/[token]/results"
              options={{
                title: "Recap",
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
              name="badges/index"
              options={{
                title: "All badges",
                headerBackTitle: "Profile",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/stats/[category]"
              options={{
                title: "Stats",
                headerBackTitle: "Back",
                animation: "fade",
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
            <Stack.Screen
              name="games/create"
              options={{
                title: "New game",
                headerBackTitle: "Games",
              }}
            />
            <Stack.Screen
              name="games/session/[sessionId]"
              options={{
                title: "Game",
                headerBackTitle: "Games",
              }}
            />
            <Stack.Screen
              name="games/session/[sessionId]/settings"
              options={{
                title: "Game settings",
                headerBackTitle: "Game",
              }}
            />
                </Stack>
              </View>
            </KeyboardProvider>
          </AblyChatProviders>
        </InAppToastProvider>
        </ChatUnreadProvider>
      </NotificationBadgeProvider>
    </ClerkProvider>
  );
}
