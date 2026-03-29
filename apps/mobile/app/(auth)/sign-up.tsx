import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSSO, useSignUp } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppleLogo } from "../../components/apple-logo";
import { GoogleLogo } from "../../components/google-logo";
import { publicWebOrigin } from "../../lib/api";
import { authFormStyles } from "../../lib/auth-form-styles";
import { clerkNativeOAuthRedirectUrl, formatClerkError, isAlreadySignedInError, isSSOCancellation } from "../../lib/auth-helpers";
import { colors } from "../../lib/theme";

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
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
  const [appleSubmitting, setAppleSubmitting] = useState(false);

  const canSubmitCreate = email.trim().length > 0 && password.length > 0;
  const canSubmitVerify = code.trim().length > 0;
  const ssoSubmitting = googleSubmitting || appleSubmitting;

  async function onSignUp() {
    if (!isLoaded || !canSubmitCreate) return;
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
    if (!isLoaded || !canSubmitVerify) return;
    setSubmitting(true);
    setError(null);
    try {
      const verified = await signUp.attemptEmailAddressVerification({ code: code.trim() });
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
      const redirectUrl = clerkNativeOAuthRedirectUrl();
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
      if (isSSOCancellation(googleError)) return;
      if (isAlreadySignedInError(googleError)) {
        router.replace("/(tabs)");
        return;
      }
      setError(formatClerkError(googleError));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function onAppleSignUp() {
    if (!isLoaded) return;
    setAppleSubmitting(true);
    setError(null);
    try {
      const redirectUrl = clerkNativeOAuthRedirectUrl();
      const { createdSessionId, setActive: setActiveFromSSO } = await startSSOFlow({
        strategy: "oauth_apple",
        redirectUrl,
      });
      if (!createdSessionId || !setActiveFromSSO) {
        setError("Apple sign-up could not be completed.");
        return;
      }
      await setActiveFromSSO({ session: createdSessionId });
      router.replace("/(tabs)");
    } catch (appleError) {
      if (isSSOCancellation(appleError)) return;
      if (isAlreadySignedInError(appleError)) {
        router.replace("/(tabs)");
        return;
      }
      setError(formatClerkError(appleError));
    } finally {
      setAppleSubmitting(false);
    }
  }

  function goSignIn() {
    router.replace("/(auth)/sign-in");
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 16) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical
    >
      <View style={styles.form}>
            <Text style={authFormStyles.title}>
              {step === "create" ? "Create account" : "Verify email"}
            </Text>
            <Text style={authFormStyles.subtitle}>
              {step === "create"
                ? "Create your Parfade account to host rounds, join invites, and chat with your group."
                : "Enter the verification code sent to your email."}
            </Text>
            {step === "create" ? (
              <>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={colors.muted}
                  style={authFormStyles.input}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={colors.muted}
                  style={authFormStyles.input}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor={colors.muted}
                  style={authFormStyles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor={colors.muted}
                  style={authFormStyles.input}
                />
                <Pressable
                  style={[
                    authFormStyles.button,
                    (submitting || !canSubmitCreate) && authFormStyles.buttonDisabled,
                  ]}
                  onPress={() => void onSignUp()}
                  disabled={submitting || ssoSubmitting || !canSubmitCreate}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={authFormStyles.buttonText}>Create account</Text>
                  )}
                </Pressable>
                <View style={authFormStyles.dividerRow}>
                  <View style={authFormStyles.dividerLine} />
                  <Text style={authFormStyles.dividerText}>or</Text>
                  <View style={authFormStyles.dividerLine} />
                </View>
                {Platform.OS === "ios" ? (
                  <Pressable
                    style={[authFormStyles.buttonApple, appleSubmitting && authFormStyles.buttonDisabled]}
                    onPress={() => void onAppleSignUp()}
                    disabled={ssoSubmitting || submitting}
                  >
                    <View style={authFormStyles.buttonSecondaryRow}>
                      <AppleLogo size={20} color="#fff" />
                      <Text style={authFormStyles.buttonAppleText}>
                        {appleSubmitting ? "Opening Apple..." : "Continue with Apple"}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[
                    authFormStyles.buttonSecondary,
                    googleSubmitting && authFormStyles.buttonDisabled,
                  ]}
                  onPress={() => void onGoogleSignUp()}
                  disabled={ssoSubmitting || submitting}
                >
                  <View style={authFormStyles.buttonSecondaryRow}>
                    <GoogleLogo size={20} />
                    <Text style={authFormStyles.buttonSecondaryText}>
                      {googleSubmitting ? "Opening Google..." : "Continue with Google"}
                    </Text>
                  </View>
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
                  style={authFormStyles.input}
                />
                <Pressable
                  style={[
                    authFormStyles.button,
                    (submitting || !canSubmitVerify) && authFormStyles.buttonDisabled,
                  ]}
                  onPress={() => void onVerifyCode()}
                  disabled={submitting || !canSubmitVerify}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={authFormStyles.buttonText}>Verify code</Text>
                  )}
                </Pressable>
              </>
            )}
            {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
            {step === "create" ? (
              <Text style={authFormStyles.legalText}>
                By signing up, you agree to our{" "}
                <Text
                  style={authFormStyles.legalLink}
                  onPress={() => void Linking.openURL(`${publicWebOrigin}/privacy`)}
                >
                  Privacy Policy
                </Text>{" "}
                and{" "}
                <Text
                  style={authFormStyles.legalLink}
                  onPress={() => void Linking.openURL(`${publicWebOrigin}/terms`)}
                >
                  Terms of Service
                </Text>
                .
              </Text>
            ) : null}
            <Pressable style={authFormStyles.switchRow} onPress={goSignIn}>
              <Text style={styles.link}>Already have an account? Sign in</Text>
            </Pressable>
            {Platform.OS === "web" ? (
              <View nativeID="clerk-captcha" style={authFormStyles.captchaSlot} />
            ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 22, paddingTop: 24 },
  form: { gap: 12, paddingBottom: 24 },
  link: { color: colors.fairway, fontWeight: "600", fontSize: 15 },
});
