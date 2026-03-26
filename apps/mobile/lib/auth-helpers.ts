import { Platform } from "react-native";
import { isClerkAPIResponseError } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import * as Linking from "expo-linking";

export function clerkNativeOAuthRedirectUrl(): string {
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier?.trim();
  if (Platform.OS === "ios" && bundleId) return `${bundleId}://callback`;
  return Linking.createURL("/");
}

export function isSSOCancellation(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("cancel") || msg.includes("user_cancelled") || msg.includes("dismissed")) {
      return true;
    }
  }
  if (isClerkAPIResponseError(err)) {
    return err.errors.some(
      (e) => e.code === "user_cancelled" || e.message?.toLowerCase().includes("cancel"),
    );
  }
  return false;
}

export function formatClerkError(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first?.longMessage ?? first?.message ?? "Request failed.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export type SecondFactorStep =
  | { strategy: "email_code"; emailAddressId: string; safeIdentifier?: string }
  | { strategy: "phone_code"; phoneNumberId: string; safeIdentifier?: string }
  | { strategy: "totp" }
  | { strategy: "backup_code" };

export function pickSecondFactor(factors: unknown): SecondFactorStep | null {
  if (!Array.isArray(factors) || factors.length === 0) return null;
  const order = ["email_code", "phone_code", "totp", "backup_code"] as const;
  for (const strat of order) {
    const raw = factors.find(
      (x): x is Record<string, unknown> =>
        typeof x === "object" && x !== null && x.strategy === strat,
    );
    if (!raw) continue;
    if (strat === "email_code" && typeof raw.emailAddressId === "string") {
      return {
        strategy: "email_code",
        emailAddressId: raw.emailAddressId,
        safeIdentifier: typeof raw.safeIdentifier === "string" ? raw.safeIdentifier : undefined,
      };
    }
    if (strat === "phone_code" && typeof raw.phoneNumberId === "string") {
      return {
        strategy: "phone_code",
        phoneNumberId: raw.phoneNumberId,
        safeIdentifier: typeof raw.safeIdentifier === "string" ? raw.safeIdentifier : undefined,
      };
    }
    if (strat === "totp") return { strategy: "totp" };
    if (strat === "backup_code") return { strategy: "backup_code" };
  }
  return null;
}
