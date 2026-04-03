import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ClerkProvider, useAuth, useClerk } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { useEffect, useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BuildConfigMissingScreen } from "../components/build-config-missing-screen";
import { ParfadeAppRealtimeGate } from "../components/parfade-app-realtime";
import { AblyChatProviders } from "../lib/ably-chat-context";
import { InAppToastProvider } from "../lib/in-app-toast-context";
import { ChatUnreadProvider } from "../lib/chat-unread-context";
import { GameSessionActiveProvider } from "../lib/game-session-active-context";
import { NotificationBadgeProvider } from "../lib/notification-badge-context";
import { SnackbarProvider } from "../lib/snackbar-context";
import { NotificationDeepLinkEffects } from "../lib/notification-deep-link";
import { setApiAuthGetToken } from "../lib/api-auth-token";
import { setApiSessionInvalidHandler } from "../lib/api-session-invalid";
import { clearAllCaches } from "../lib/clear-all-caches";
import { initializeParfadeMobileAds } from "../lib/parfade-admob";
import { refreshGameTypes } from "../lib/game-types-cache";
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

function GameTypesBootstrap() {
  useEffect(() => {
    void refreshGameTypes();
  }, []);
  return null;
}

/** API returned 401 with a Bearer token — sign out so we don’t spin (Clerk can stay “signed in”). */
function ApiSessionInvalidBridge() {
  const { signOut } = useClerk();
  useEffect(() => {
    setApiSessionInvalidHandler(async () => {
      await clearAllCaches();
      await signOut();
    });
    return () => setApiSessionInvalidHandler(null);
  }, [signOut]);
  return null;
}

/** Lets API + Ably retry once with a fresh JWT after resume-from-background 401s. */
function ApiAuthTokenBridge() {
  const { getToken } = useAuth();
  useLayoutEffect(() => {
    setApiAuthGetToken(getToken);
    return () => setApiAuthGetToken(null);
  }, [getToken]);
  return null;
}

/**
 * On cold start, if Clerk says signed-in, verify the token is actually valid
 * with a lightweight API call. If the session is stale (401), sign out
 * immediately so the user sees a clean sign-in screen instead of a crash loop.
 */
function SessionHealthCheck() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const didCheck = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || didCheck.current) return;
    didCheck.current = true;

    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          await clearAllCaches();
          await signOut();
          return;
        }
        const base =
          process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "";
        const res = await fetch(`${base}/api/users/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          await clearAllCaches();
          await signOut();
        }
      } catch {
        // Network error on startup — don't sign out, let normal flow retry
      }
    })();
  }, [isLoaded, isSignedIn, getToken, signOut]);

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
      <GameTypesBootstrap />
      <ClerkLoadedSplashSync />
      <ApiSessionInvalidBridge />
      <ApiAuthTokenBridge />
      <SessionHealthCheck />
      <NotificationBadgeProvider>
        <GameSessionActiveProvider>
        <ChatUnreadProvider>
        <InAppToastProvider>
          <AblyChatProviders>
            <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
            <KeyboardProvider>
              <ParfadeAppRealtimeGate />
              <NotificationDeepLinkEffects />
              <StatusBar style="dark" />
              <SnackbarProvider>
              <View style={{ flex: 1 }}>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    headerBackButtonDisplayMode: "minimal",
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: "" }} />
            <Stack.Screen
              name="round/[token]"
              options={{
                title: "Round",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="round/[token]/edit"
              options={{
                title: "Edit Round",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="round/[token]/chat"
              options={{
                title: "",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="round/[token]/results"
              options={{
                title: "Recap",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/index"
              options={{
                title: "Profile",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/followers"
              options={{
                title: "Followers",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/following"
              options={{
                title: "Following",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="profile/edit"
              options={{
                title: "Edit profile",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="badges/index"
              options={{
                title: "All badges",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="profile/[userId]/stats/[category]"
              options={{
                title: "Stats",
                headerBackTitle: "",
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="chats"
              options={{
                title: "Chats",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="new-chat"
              options={{
                title: "New Message",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="conversation/[id]/chat"
              options={{
                title: "",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="chat-info"
              options={{
                title: "Details",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="notifications"
              options={{
                title: "Notifications",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                title: "Settings",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="invite-friends"
              options={{
                title: "Invite Friends",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="games/create"
              options={{
                title: "New game",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="games/session/[sessionId]"
              options={{
                title: "Game",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="games/session/[sessionId]/settings"
              options={{
                title: "Game settings",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="search-users"
              options={{
                title: "Search Users",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="search-groups"
              options={{
                title: "Search Groups",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="create-group"
              options={{
                title: "Create Group",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="group/[groupId]/index"
              options={{
                title: "Group",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="group/[groupId]/members"
              options={{
                title: "Members",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="group/[groupId]/settings"
              options={{
                title: "Group Settings",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="group/[groupId]/post"
              options={{
                title: "",
                headerShown: false,
                presentation: "formSheet",
                sheetAllowedDetents: [0.55, 1.0],
                sheetGrabberVisible: true,
                sheetCornerRadius: 16,
                sheetExpandsWhenScrolledToEdge: true,
              }}
            />
            <Stack.Screen
              name="profile/post"
              options={{
                title: "",
                headerShown: false,
                presentation: "formSheet",
                sheetAllowedDetents: [0.55, 1.0],
                sheetGrabberVisible: true,
                sheetCornerRadius: 16,
                sheetExpandsWhenScrolledToEdge: true,
              }}
            />
            <Stack.Screen
              name="score/post"
              options={{
                title: "Post Score",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen
              name="tournament-details-editor"
              options={{
                title: "",
                headerShown: false,
                presentation: "formSheet",
                sheetAllowedDetents: [0.55, 1.0],
                sheetGrabberVisible: true,
                sheetCornerRadius: 16,
                sheetExpandsWhenScrolledToEdge: true,
              }}
            />
                </Stack>
              </View>
              </SnackbarProvider>
            </KeyboardProvider>
            </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </AblyChatProviders>
        </InAppToastProvider>
        </ChatUnreadProvider>
        </GameSessionActiveProvider>
      </NotificationBadgeProvider>
    </ClerkProvider>
  );
}
