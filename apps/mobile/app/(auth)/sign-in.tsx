import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSSO, useSignIn } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppleLogo } from "../../components/apple-logo";
import { GoogleLogo } from "../../components/google-logo";
import { authFormStyles } from "../../lib/auth-form-styles";
import {
  clerkNativeOAuthRedirectUrl,
  formatClerkError,
  isSSOCancellation,
  pickSecondFactor,
  type SecondFactorStep,
} from "../../lib/auth-helpers";
import { colors } from "../../lib/theme";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactor, setSecondFactor] = useState<SecondFactorStep | null>(null);
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);

  const canSubmitSignIn = identifier.trim().length > 0 && password.length > 0;
  const canSubmitSecondFactor = secondFactorCode.trim().length > 0;
  const ssoSubmitting = googleSubmitting || appleSubmitting;

  function backToCredentials() {
    setSecondFactor(null);
    setSecondFactorCode("");
    setError(null);
  }

  async function onSignIn() {
    if (!isLoaded || !signIn || !canSubmitSignIn) return;
    setSubmitting(true);
    setError(null);
    try {
      let result = await signIn.create({
        identifier: identifier.trim(),
        password,
      });
      if (result.status === "needs_first_factor") {
        result = await signIn.attemptFirstFactor({ strategy: "password", password });
      }
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      if (result.status === "needs_new_password") {
        setError("You need to set a new password. Finish on the web or use Google sign-in.");
        return;
      }
      if (result.status === "needs_first_factor") {
        setError("Password sign-in failed. Try again or use Google.");
        return;
      }
      if (
        result.status === "needs_second_factor" ||
        (result as any).status === "needs_client_trust"
      ) {
        const factors = result.supportedSecondFactors ?? signIn.supportedSecondFactors;
        const step = pickSecondFactor(factors);
        if (!step) {
          setError(
            "This verification method isn't available in the app yet. Try Google or sign in on the web.",
          );
          return;
        }
        if (step.strategy === "email_code") {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: step.emailAddressId,
          });
        } else if (step.strategy === "phone_code") {
          await signIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: step.phoneNumberId,
          });
        }
        setSecondFactor(step);
        setSecondFactorCode("");
        return;
      }
      setError("Sign-in could not be completed. Try again or use Google.");
    } catch (signInError) {
      setError(formatClerkError(signInError));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifySecondFactor() {
    if (!isLoaded || !signIn || !secondFactor || !canSubmitSecondFactor) return;
    setSubmitting(true);
    setError(null);
    try {
      const verifyCode = secondFactorCode.trim();
      let updated = signIn;
      if (secondFactor.strategy === "email_code") {
        updated = await signIn.attemptSecondFactor({ strategy: "email_code", code: verifyCode });
      } else if (secondFactor.strategy === "phone_code") {
        updated = await signIn.attemptSecondFactor({ strategy: "phone_code", code: verifyCode });
      } else if (secondFactor.strategy === "totp") {
        updated = await signIn.attemptSecondFactor({ strategy: "totp", code: verifyCode });
      } else {
        updated = await signIn.attemptSecondFactor({ strategy: "backup_code", code: verifyCode });
      }
      if (updated.status === "complete" && updated.createdSessionId) {
        await setActive({ session: updated.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      setError("That code didn't work. Try again or request a new one.");
    } catch (verifyError) {
      setError(formatClerkError(verifyError));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendSecondFactor() {
    if (!isLoaded || !signIn || !secondFactor) return;
    if (secondFactor.strategy !== "email_code" && secondFactor.strategy !== "phone_code") return;
    setSubmitting(true);
    setError(null);
    try {
      if (secondFactor.strategy === "email_code") {
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: secondFactor.emailAddressId,
        });
      } else {
        await signIn.prepareSecondFactor({
          strategy: "phone_code",
          phoneNumberId: secondFactor.phoneNumberId,
        });
      }
    } catch (resendError) {
      setError(formatClerkError(resendError));
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleSignIn() {
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
        setError("Google sign-in could not be completed.");
        return;
      }
      await setActiveFromSSO({ session: createdSessionId });
      router.replace("/(tabs)");
    } catch (googleError) {
      if (isSSOCancellation(googleError)) return;
      setError(
        googleError instanceof Error ? googleError.message : "Unable to sign in with Google.",
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function onAppleSignIn() {
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
        setError("Apple sign-in could not be completed.");
        return;
      }
      await setActiveFromSSO({ session: createdSessionId });
      router.replace("/(tabs)");
    } catch (appleError) {
      if (isSSOCancellation(appleError)) return;
      setError(
        appleError instanceof Error ? appleError.message : "Unable to sign in with Apple.",
      );
    } finally {
      setAppleSubmitting(false);
    }
  }

  const secondFactorSubtitle =
    secondFactor?.strategy === "email_code"
      ? `Enter the code we sent${secondFactor.safeIdentifier ? ` to ${secondFactor.safeIdentifier}` : ""}.`
      : secondFactor?.strategy === "phone_code"
        ? `Enter the code we sent${secondFactor.safeIdentifier ? ` to ${secondFactor.safeIdentifier}` : ""}.`
        : secondFactor?.strategy === "totp"
          ? "Enter the code from your authenticator app."
          : secondFactor?.strategy === "backup_code"
            ? "Enter one of your backup codes."
            : "";

  function goSignUp() {
    router.replace("/(auth)/sign-up");
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
            {secondFactor ? (
              <>
                <Text style={authFormStyles.title}>{"Verify it's you"}</Text>
                <Text style={authFormStyles.subtitle}>{secondFactorSubtitle}</Text>
                <TextInput
                  value={secondFactorCode}
                  onChangeText={setSecondFactorCode}
                  autoCapitalize="none"
                  keyboardType={secondFactor.strategy === "backup_code" ? "default" : "number-pad"}
                  placeholder="Verification code"
                  placeholderTextColor={colors.muted}
                  style={authFormStyles.input}
                />
                {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
                <Pressable
                  style={[
                    authFormStyles.button,
                    (submitting || !canSubmitSecondFactor) && authFormStyles.buttonDisabled,
                  ]}
                  onPress={() => void onVerifySecondFactor()}
                  disabled={submitting || googleSubmitting || !canSubmitSecondFactor}
                >
                  <Text style={authFormStyles.buttonText}>
                    {submitting ? "Verifying..." : "Continue"}
                  </Text>
                </Pressable>
                {secondFactor.strategy === "email_code" || secondFactor.strategy === "phone_code" ? (
                  <Pressable
                    style={authFormStyles.switchRow}
                    onPress={() => void onResendSecondFactor()}
                    disabled={submitting || googleSubmitting}
                  >
                    <Text style={styles.link}>Resend code</Text>
                  </Pressable>
                ) : null}
                <Pressable style={authFormStyles.switchRow} onPress={backToCredentials}>
                  <Text style={styles.link}>{"Back to email & password"}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={authFormStyles.title}>Sign in</Text>
                <Text style={authFormStyles.subtitle}>
                  Welcome back—use the email and password for your Parfade account.
                </Text>
                <TextInput
                  value={identifier}
                  onChangeText={setIdentifier}
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
                {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
                <Pressable
                  style={[
                    authFormStyles.button,
                    (submitting || !canSubmitSignIn) && authFormStyles.buttonDisabled,
                  ]}
                  onPress={() => void onSignIn()}
                  disabled={submitting || ssoSubmitting || !canSubmitSignIn}
                >
                  <Text style={authFormStyles.buttonText}>
                    {submitting ? "Signing in..." : "Sign in"}
                  </Text>
                </Pressable>
                <View style={authFormStyles.dividerRow}>
                  <View style={authFormStyles.dividerLine} />
                  <Text style={authFormStyles.dividerText}>or</Text>
                  <View style={authFormStyles.dividerLine} />
                </View>
                {Platform.OS === "ios" ? (
                  <Pressable
                    style={[authFormStyles.buttonApple, appleSubmitting && authFormStyles.buttonDisabled]}
                    onPress={() => void onAppleSignIn()}
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
                  onPress={() => void onGoogleSignIn()}
                  disabled={ssoSubmitting || submitting}
                >
                  <View style={authFormStyles.buttonSecondaryRow}>
                    <GoogleLogo size={20} />
                    <Text style={authFormStyles.buttonSecondaryText}>
                      {googleSubmitting ? "Opening Google..." : "Continue with Google"}
                    </Text>
                  </View>
                </Pressable>
                <Pressable style={authFormStyles.switchRow} onPress={goSignUp}>
                  <Text style={styles.link}>Need an account? Sign up</Text>
                </Pressable>
              </>
            )}
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
