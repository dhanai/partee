import { useState } from "react";
import { Redirect, router } from "expo-router";
import { useAuth, useSSO, useSignUp } from "@clerk/clerk-expo";
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

export default function SignUpScreen() {
  const { isSignedIn } = useAuth();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"create" | "verify">("create");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSignUp() {
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });

      if (created.status === "complete") {
        await setActive({ session: created.createdSessionId });
        router.replace("/(tabs)");
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (signUpError) {
      setError(signUpError instanceof Error ? signUpError.message : "Unable to sign up.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode() {
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const verified = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
      if (verified.status !== "complete") {
        setError("Verification not complete yet. Try again.");
        return;
      }
      await setActive({ session: verified.createdSessionId });
      router.replace("/(tabs)");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleSignUp() {
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
        setError("Google sign-up could not be completed.");
        return;
      }
      await setActiveFromSSO({ session: createdSessionId });
      router.replace("/(tabs)");
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Unable to sign up with Google.");
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
        <Text style={styles.title}>{step === "create" ? "Create account" : "Verify email"}</Text>
        <Text style={styles.subtitle}>
          {step === "create"
            ? "Make a new account to test a second user."
            : "Enter the verification code sent to your email."}
        </Text>

        {step === "create" ? (
          <>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
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

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={() => void onSignUp()}
              disabled={submitting || googleSubmitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Creating account..." : "Create account"}
              </Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={[styles.buttonSecondary, googleSubmitting && styles.buttonDisabled]}
              onPress={() => void onGoogleSignUp()}
              disabled={googleSubmitting || submitting}
            >
              <Text style={styles.buttonSecondaryText}>
                {googleSubmitting ? "Opening Google..." : "Continue with Google"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="Verification code"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={() => void onVerifyCode()}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>{submitting ? "Verifying..." : "Verify code"}</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.switchRow} onPress={() => router.replace("/(auth)/sign-in")}>
          <Text style={styles.switchText}>Already have an account? Sign in</Text>
        </Pressable>

        {Platform.OS === "web" ? <View nativeID="clerk-captcha" style={styles.captchaSlot} /> : null}
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
  captchaSlot: {
    minHeight: 78,
    marginTop: 4,
  },
});
