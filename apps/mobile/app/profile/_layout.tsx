import { Stack } from "expo-router";

/**
 * Hides the root stack header for all /profile/* routes so only the inner
 * profile/[userId] stack shows a bar (avoids duplicate headers + `profile/[userId]` title).
 */
export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[userId]" />
      <Stack.Screen name="edit" />
    </Stack>
  );
}
