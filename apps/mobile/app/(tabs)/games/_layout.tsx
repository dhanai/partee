import { Stack } from "expo-router";
import { ParfadeLogo } from "../../../components/parfade-logo";
import { colors } from "../../../lib/theme";

export default function GamesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <ParfadeLogo compact />,
          headerTitleAlign: "left",
        }}
      />
      <Stack.Screen name="create" options={{ title: "New game" }} />
      <Stack.Screen name="session/[sessionId]" options={{ title: "Game" }} />
    </Stack>
  );
}
