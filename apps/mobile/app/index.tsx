import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

export default function IndexGate() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.mustard} />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    /** Matches native splash (`expo-splash-screen`) so handoff isn’t a blank/cream flash. */
    backgroundColor: colors.fairway,
  },
});
