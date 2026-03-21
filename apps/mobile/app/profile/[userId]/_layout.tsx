import { Stack } from "expo-router";
import { colors } from "../../../lib/theme";

/**
 * Nested stack so the profile index route gets correct options (Expo Router registers it as
 * `…/index`, not `profile/[userId]` — the root Stack.Screen never matched, causing the dev route
 * title + opaque header).
 */
export default function ProfileUserStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Profile",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="followers"
        options={{
          title: "Followers",
          headerBackTitle: "Profile",
        }}
      />
      <Stack.Screen
        name="following"
        options={{
          title: "Following",
          headerBackTitle: "Profile",
        }}
      />
    </Stack>
  );
}
