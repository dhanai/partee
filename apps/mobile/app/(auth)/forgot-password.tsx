import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authFormStyles } from "../../lib/auth-form-styles";
import { formatClerkError } from "../../lib/auth-helpers";
import { colors } from "../../lib/theme";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmitEmail = email.trim().length > 0;
  const canSubmitReset = code.trim().length > 0 && newPassword.length >= 8;

  async function onRequestCode() {
    if (!isLoaded || !signIn || !canSubmitEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setStep("reset");
    } catch (err) {
      setError(formatClerkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetPassword() {
    if (!isLoaded || !signIn || !canSubmitReset) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password: newPassword,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      if (result.status === "needs_second_factor") {
        setError("Password reset complete. Please sign in with your new password.");
        setTimeout(() => router.replace("/(auth)/sign-in"), 1500);
        return;
      }
      setError("Password reset could not be completed. Try again.");
    } catch (err) {
      setError(formatClerkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendCode() {
    if (!isLoaded || !signIn) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
    } catch (err) {
      setError(formatClerkError(err));
    } finally {
      setSubmitting(false);
    }
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
        {step === "email" ? (
          <>
            <Text style={authFormStyles.title}>Reset password</Text>
            <Text style={authFormStyles.subtitle}>
              Enter the email for your Parfade account and we'll send you a code to reset your
              password.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.muted}
              style={authFormStyles.input}
            />
            {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
            <Pressable
              style={[
                authFormStyles.button,
                (submitting || !canSubmitEmail) && authFormStyles.buttonDisabled,
              ]}
              onPress={() => void onRequestCode()}
              disabled={submitting || !canSubmitEmail}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={authFormStyles.buttonText}>Send reset code</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={authFormStyles.title}>Set new password</Text>
            <Text style={authFormStyles.subtitle}>
              Enter the code we sent to {email} and your new password.
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="Verification code"
              placeholderTextColor={colors.muted}
              style={authFormStyles.input}
            />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="New password (min 8 characters)"
              placeholderTextColor={colors.muted}
              style={authFormStyles.input}
            />
            {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
            <Pressable
              style={[
                authFormStyles.button,
                (submitting || !canSubmitReset) && authFormStyles.buttonDisabled,
              ]}
              onPress={() => void onResetPassword()}
              disabled={submitting || !canSubmitReset}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={authFormStyles.buttonText}>Reset password</Text>
              )}
            </Pressable>
            <Pressable
              style={authFormStyles.switchRow}
              onPress={() => void onResendCode()}
              disabled={submitting}
            >
              <Text style={styles.link}>Resend code</Text>
            </Pressable>
          </>
        )}
        <Pressable style={authFormStyles.switchRow} onPress={() => router.back()}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
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
