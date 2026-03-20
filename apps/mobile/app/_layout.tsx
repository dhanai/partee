import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { NotificationBadgeProvider } from "../lib/notification-badge-context";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in mobile env.");
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <NotificationBadgeProvider>
        <StatusBar style="dark" />
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
            name="profile/[userId]"
            options={{
              title: "Profile",
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
      </NotificationBadgeProvider>
    </ClerkProvider>
  );
}
