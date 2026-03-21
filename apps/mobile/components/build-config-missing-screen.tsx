import { Platform, ScrollView, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";

type Props = {
  /** Which env var was missing at build time (EAS / .env). */
  missingEnv: string;
};

/**
 * Shown when required EXPO_PUBLIC_* vars were not inlined into the release bundle.
 * A hard throw in _layout would crash TestFlight instantly with no explanation.
 */
export function BuildConfigMissingScreen({ missingEnv }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Configuration needed</Text>
      <Text style={styles.body}>
        This build is missing <Text style={styles.mono}>{missingEnv}</Text>. It must be set when
        EAS builds the app so it is baked into the JavaScript bundle.
      </Text>
      <Text style={styles.subhead}>Fix (production / TestFlight)</Text>
      <Text style={styles.body}>
        1. In Expo: Project → Environment variables (or run{" "}
        <Text style={styles.mono}>eas secret:create</Text>).
        {"\n\n"}
        2. Add <Text style={styles.mono}>{missingEnv}</Text> with your Clerk{" "}
        <Text style={styles.bold}>publishable</Text> key (e.g.{" "}
        <Text style={styles.mono}>pk_live_…</Text>).
        {"\n\n"}
        3. Add <Text style={styles.mono}>EXPO_PUBLIC_API_BASE_URL</Text> with your live API origin
        (HTTPS, no trailing slash).
        {"\n\n"}
        4. Run a <Text style={styles.bold}>new</Text>{" "}
        <Text style={styles.mono}>eas build --profile production --platform ios</Text> and submit
        again. Old installs keep old env until rebuilt.
      </Text>
      <Text style={styles.hint}>See docs/TESTFLIGHT-GUIDE.md §3 in the repo.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 56,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12,
  },
  subhead: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  bold: { fontWeight: "700", color: colors.text },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    color: colors.text,
  },
  hint: {
    marginTop: 24,
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
  },
});
