import { useState } from "react";
import { Redirect, router } from "expo-router";
import { useAuth, useSSO, useSignIn } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ParteeLogo } from "../../components/partee-logo";
import { colors } from "../../lib/theme";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSignIn() {
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: identifier.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else {
        setError("Additional verification required. Complete sign-in on web.");
      }
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleSignIn() {
    if (!isLoaded) return;
    setGoogleSubmitting(true);
    setError(null);

    try {
      const redirectUrl = Linking.createURL("/(tabs)");
      const { createdSessionId, setActive: setActiveFromSSO } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      if (!createdSessionId || !setActiveFromSSO) {
        setError("Google sign-in could not be completed.");
        return;
      }

      await setActiveFromSSO({ session: createdSessionId });
      router.replace("/(tabs)");
    } catch (googleError) {
      setError(
        googleError instanceof Error ? googleError.message : "Unable to sign in with Google.",
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <ParteeLogo />
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use the same account you use on web.</Text>

        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void onSignIn()}
          disabled={submitting || googleSubmitting}
        >
          <Text style={styles.buttonText}>{submitting ? "Signing in..." : "Sign in"}</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.buttonSecondary, googleSubmitting && styles.buttonDisabled]}
          onPress={() => void onGoogleSignIn()}
          disabled={googleSubmitting || submitting}
        >
          <Text style={styles.buttonSecondaryText}>
            {googleSubmitting ? "Opening Google..." : "Continue with Google"}
          </Text>
        </Pressable>

        <Pressable style={styles.switchRow} onPress={() => router.replace("/(auth)/sign-up")}>
          <Text style={styles.switchText}>Need an account? Sign up</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
  },
  error: {
    color: colors.danger,
  },
  button: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    backgroundColor: "#ece8e1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonSecondaryText: {
    color: colors.text,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.muted,
    fontSize: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  switchRow: {
    paddingTop: 6,
    alignItems: "center",
  },
  switchText: {
    color: colors.fairway,
    fontWeight: "600",
  },
});
