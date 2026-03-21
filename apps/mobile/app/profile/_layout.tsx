import { Stack } from "expo-router";
import { colors } from "../../lib/theme";

/**
 * Default: no header on the profile shell (inner profile/[userId] stack owns headers).
 * Edit profile re-enables a single bar here so it still works when opened from tabs.
 */
export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[userId]" />
      <Stack.Screen
        name="edit"
        options={{
          headerShown: true,
          title: "Edit profile",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
