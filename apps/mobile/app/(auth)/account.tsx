import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAuth, useSSO, useSignIn, useSignUp } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthLandingBackground } from "../../components/auth-landing-background";
import { GoogleLogo } from "../../components/google-logo";
import { ParteeLogo } from "../../components/partee-logo";
import { AUTH_LOGO_EXTRA_TOP, authFormStyles } from "../../lib/auth-form-styles";
import { colors } from "../../lib/theme";

WebBrowser.maybeCompleteAuthSession();

function maxSheetScrollHeight(): number {
  return Math.round(Dimensions.get("window").height * 0.78);
}

type AnimLayer = "none" | "toSignUp" | "toSignIn";

function useDualSheetAnimation(
  signInFullH: number,
  signUpFullH: number,
  initialSignUp: boolean,
) {
  const initialUpRef = useRef(initialSignUp);
  const signInY = useRef(new Animated.Value(0)).current;
  const signUpY = useRef(new Animated.Value(0)).current;
  const [signUpActive, setSignUpActive] = useState(initialSignUp);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animLayer, setAnimLayer] = useState<AnimLayer>("none");
  const signUpActiveRef = useRef(signUpActive);
  signUpActiveRef.current = signUpActive;
  const seededRef = useRef(false);

  const hIn = useRef(Math.max(120, signInFullH));
  const hUp = useRef(Math.max(120, signUpFullH));
  hIn.current = Math.max(120, signInFullH);
  hUp.current = Math.max(120, signUpFullH);

  useEffect(() => {
    if (signInFullH < 60 || signUpFullH < 60) return;
    if (!seededRef.current) {
      seededRef.current = true;
      if (initialUpRef.current) {
        signInY.setValue(signInFullH);
        signUpY.setValue(0);
      } else {
        signInY.setValue(0);
        signUpY.setValue(signUpFullH);
      }
      return;
    }
    if (signUpActiveRef.current) {
      signUpY.setValue(0);
      signInY.setValue(signInFullH);
    } else {
      signInY.setValue(0);
      signUpY.setValue(signUpFullH);
    }
  }, [signInFullH, signUpFullH, signInY, signUpY]);

  const layoutReady = signInFullH >= 60 && signUpFullH >= 60;

  const goToSignUp = useCallback(() => {
    if (!layoutReady || signUpActive || isAnimating) return;
    setIsAnimating(true);
    setAnimLayer("toSignUp");
    Animated.parallel([
      Animated.timing(signInY, {
        toValue: hIn.current,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(signUpY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setIsAnimating(false);
      setAnimLayer("none");
      if (finished) setSignUpActive(true);
    });
  }, [layoutReady, signUpActive, isAnimating, signInY, signUpY]);

  const goToSignIn = useCallback(() => {
    if (!layoutReady || !signUpActive || isAnimating) return;
    setIsAnimating(true);
    setAnimLayer("toSignIn");
    Animated.parallel([
      Animated.timing(signInY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(signUpY, {
        toValue: hUp.current,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setIsAnimating(false);
      setAnimLayer("none");
      if (finished) setSignUpActive(false);
    });
  }, [layoutReady, signUpActive, isAnimating, signInY, signUpY]);

  const signInZ =
    animLayer === "toSignIn" ? 12 : signUpActive ? 1 : 10;
  const signUpZ =
    animLayer === "toSignUp" ? 12 : signUpActive ? 10 : 1;

  const signInPointerEvents: "auto" | "none" =
    layoutReady && !signUpActive && !isAnimating ? "auto" : "none";
  const signUpPointerEvents: "auto" | "none" =
    layoutReady && signUpActive && !isAnimating ? "auto" : "none";

  return {
    signInY,
    signUpY,
    signInZ,
    signUpZ,
    goToSignUp,
    goToSignIn,
    signInPointerEvents,
    signUpPointerEvents,
    layoutReady,
  };
}

function SignInFields({
  onGoSignUp,
}: {
  onGoSignUp: () => void;
}) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const canSubmitSignIn =
    identifier.trim().length > 0 && password.length > 0;

  async function onSignIn() {
    if (!isLoaded || !canSubmitSignIn) return;
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
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <Text style={authFormStyles.title}>Sign in</Text>
      <Text style={authFormStyles.subtitle}>Use the same account you use on web.</Text>
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
        disabled={submitting || googleSubmitting || !canSubmitSignIn}
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
      <Pressable
        style={[
          authFormStyles.buttonSecondary,
          googleSubmitting && authFormStyles.buttonDisabled,
        ]}
        onPress={() => void onGoogleSignIn()}
        disabled={googleSubmitting || submitting}
      >
        <View style={authFormStyles.buttonSecondaryRow}>
          <GoogleLogo size={20} />
          <Text style={authFormStyles.buttonSecondaryText}>
            {googleSubmitting ? "Opening Google..." : "Continue with Google"}
          </Text>
        </View>
      </Pressable>
      <Pressable style={authFormStyles.switchRow} onPress={onGoSignUp}>
        <Text style={authFormStyles.switchText}>Need an account? Sign up</Text>
      </Pressable>
    </View>
  );
}

function SignUpFields({
  sheetPadBottom,
  onGoSignIn,
}: {
  sheetPadBottom: number;
  onGoSignIn: () => void;
}) {
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

  const canSubmitCreate = email.trim().length > 0 && password.length > 0;
  const canSubmitVerify = code.trim().length > 0;

  function handleGoSignIn() {
    setStep("create");
    setError(null);
    onGoSignIn();
  }

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
    <View style={{ gap: 12, paddingBottom: sheetPadBottom }}>
      <Text style={authFormStyles.title}>
        {step === "create" ? "Create account" : "Verify email"}
      </Text>
      <Text style={authFormStyles.subtitle}>
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
            disabled={submitting || googleSubmitting || !canSubmitCreate}
          >
            <Text style={authFormStyles.buttonText}>
              {submitting ? "Creating account..." : "Create account"}
            </Text>
          </Pressable>
          <View style={authFormStyles.dividerRow}>
            <View style={authFormStyles.dividerLine} />
            <Text style={authFormStyles.dividerText}>or</Text>
            <View style={authFormStyles.dividerLine} />
          </View>
          <Pressable
            style={[
              authFormStyles.buttonSecondary,
              googleSubmitting && authFormStyles.buttonDisabled,
            ]}
            onPress={() => void onGoogleSignUp()}
            disabled={googleSubmitting || submitting}
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
            <Text style={authFormStyles.buttonText}>
              {submitting ? "Verifying..." : "Verify code"}
            </Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={authFormStyles.error}>{error}</Text> : null}
      <Pressable style={authFormStyles.switchRow} onPress={handleGoSignIn}>
        <Text style={authFormStyles.switchText}>Already have an account? Sign in</Text>
      </Pressable>
      {Platform.OS === "web" ? (
        <View nativeID="clerk-captcha" style={authFormStyles.captchaSlot} />
      ) : null}
    </View>
  );
}

const sheetStack = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  bottom: 0,
};

export default function AuthAccountScreen() {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialSignUp = params.mode !== "signIn";

  const [signInFullH, setSignInFullH] = useState(0);
  const [signUpFullH, setSignUpFullH] = useState(0);

  const anim = useDualSheetAnimation(signInFullH, signUpFullH, initialSignUp);

  const sheetPadBottom = Math.max(insets.bottom, 20) + 10;
  const scrollMax = maxSheetScrollHeight();

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <AuthLandingBackground style={{ flex: 1 }}>
      <StatusBar style="light" />
      <View
        style={[authFormStyles.screen, { backgroundColor: "transparent" }]}
      >
        <View
          style={[
            authFormStyles.logoHeader,
            {
              paddingTop: insets.top + 4 + AUTH_LOGO_EXTRA_TOP,
              zIndex: 20,
              elevation: 20,
            },
          ]}
        >
          <ParteeLogo tone="light" />
        </View>
        <KeyboardAvoidingView
          style={authFormStyles.keyboardFill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={authFormStyles.sheetScrollContent}>
            <Animated.View
              style={[
                sheetStack,
                {
                  transform: [{ translateY: anim.signInY }],
                  zIndex: anim.signInZ,
                  elevation: anim.signInZ,
                  opacity: anim.layoutReady ? 1 : 0,
                },
              ]}
              pointerEvents={anim.signInPointerEvents}
            >
              <View
                onLayout={(e) => setSignInFullH(e.nativeEvent.layout.height)}
                style={[
                  authFormStyles.bottomSheet,
                  { paddingBottom: sheetPadBottom },
                ]}
              >
                <View style={authFormStyles.sheetHandle} />
                <ScrollView
                  style={{ maxHeight: scrollMax }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <SignInFields onGoSignUp={anim.goToSignUp} />
                </ScrollView>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                sheetStack,
                {
                  transform: [{ translateY: anim.signUpY }],
                  zIndex: anim.signUpZ,
                  elevation: anim.signUpZ,
                  opacity: anim.layoutReady ? 1 : 0,
                },
              ]}
              pointerEvents={anim.signUpPointerEvents}
            >
              <View
                onLayout={(e) => setSignUpFullH(e.nativeEvent.layout.height)}
                style={[
                  authFormStyles.bottomSheet,
                  { paddingBottom: sheetPadBottom },
                ]}
              >
                <View style={authFormStyles.sheetHandle} />
                <ScrollView
                  style={{ maxHeight: scrollMax }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <SignUpFields
                    sheetPadBottom={0}
                    onGoSignIn={anim.goToSignIn}
                  />
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </AuthLandingBackground>
  );
}
