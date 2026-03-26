import { Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";

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
        <Stack.Screen
          name="sign-in"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.7, 1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 16,
            sheetExpandsWhenScrolledToEdge: true,
          }}
        />
        <Stack.Screen
          name="sign-up"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.88, 1.0],
            sheetGrabberVisible: true,
            sheetCornerRadius: 16,
            sheetExpandsWhenScrolledToEdge: true,
          }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
