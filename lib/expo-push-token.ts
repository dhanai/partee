/**
 * Expo push token shape check (aligned with expo-server-sdk's Expo.isExpoPushToken).
 * Used by API routes without importing expo-server-sdk — avoids bundler/runtime issues on Vercel.
 */
export function isExpoPushToken(token: string): boolean {
  return (
    typeof token === "string" &&
    (((token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) &&
      token.endsWith("]")) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}
