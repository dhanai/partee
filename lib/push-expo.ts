import { Expo, type ExpoPushMessage } from "expo-server-sdk";

let client: Expo | null | undefined;

function getClient(): Expo | null {
  if (client !== undefined) return client;
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken || process.env.EXPO_PUSH_DISABLED === "1") {
    client = null;
    return client;
  }
  client = new Expo({ accessToken });
  return client;
}

const debugPush = () => process.env.EXPO_DEBUG_PUSH === "1";

export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const expo = getClient();
  if (!expo) {
    if (debugPush()) {
      console.warn(
        "[push] Skipped send: set EXPO_ACCESS_TOKEN (or EXPO_PUSH_DISABLED is 1).",
      );
    }
    return;
  }

  const valid = messages.filter((m) => typeof m.to === "string" && Expo.isExpoPushToken(m.to));
  if (valid.length === 0) {
    if (debugPush()) {
      console.warn("[push] No valid Expo push tokens in message batch.");
    }
    return;
  }

  const chunks = expo.chunkPushNotifications(valid);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      if (debugPush()) {
        console.error("[push] Expo sendPushNotificationsAsync failed:", err);
      }
    }
  }
}
