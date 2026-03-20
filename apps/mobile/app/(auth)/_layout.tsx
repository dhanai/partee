import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";

/** Expo / Metro web dev strip can sit over the top; push auth UI below it. */
const WEB_DEV_TOP_INSET =
  Platform.OS === "web" &&
  typeof __DEV__ !== "undefined" &&
  __DEV__
    ? 48
    : 0;

export default function AuthLayout() {
  return (
    <View style={[styles.shell, WEB_DEV_TOP_INSET > 0 && { paddingTop: WEB_DEV_TOP_INSET }]}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
