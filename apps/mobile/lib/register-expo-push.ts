import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiPost } from "./api";

/** Call once at startup so foreground notifications can show banners. */
export function configureExpoNotificationBehavior() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function resolveExpoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  const eas = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  if (typeof eas?.projectId === "string" && eas.projectId.length > 0) return eas.projectId;
  return null;
}

/**
 * Requests notification permission (if needed), registers an Expo push token, and saves it on the user.
 * No-op on web or when EAS projectId is not configured in app config.
 */
export async function registerExpoPushTokenWithBackend(
  getAuthToken: () => Promise<string | null>,
): Promise<void> {
  if (Platform.OS === "web") return;

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[Partee] Push token not registered: add EAS project id (run `eas init` in apps/mobile). See apps/mobile/PUSH-SETUP.md.",
      );
    }
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus =
    existing === "granted" ? existing : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  const authToken = await getAuthToken();
  if (!authToken) return;

  await apiPost("/api/users/me/push-token", { expoPushToken }, authToken);
}
