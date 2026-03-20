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

export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  const expo = getClient();
  if (!expo || messages.length === 0) return;

  const valid = messages.filter((m) => typeof m.to === "string" && Expo.isExpoPushToken(m.to));
  if (valid.length === 0) return;

  const chunks = expo.chunkPushNotifications(valid);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch {
      // Avoid failing the main request if Expo is unreachable.
    }
  }
}
