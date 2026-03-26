import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isIos = Platform.OS === "ios";

export function hapticLight() {
  if (isIos) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium() {
  if (isIos) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess() {
  if (isIos) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticWarning() {
  if (isIos) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export function hapticError() {
  if (isIos) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
