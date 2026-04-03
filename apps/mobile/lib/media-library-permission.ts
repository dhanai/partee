import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { Alert, Linking } from "react-native";

export type MediaLibraryPickerAlertCopy = {
  title?: string;
  message?: string;
};

const DEFAULT_TITLE = "Photos access needed";
const DEFAULT_MESSAGE =
  "Parfade needs access to your photo library for this. If you previously chose \"Don't Allow,\" you can turn it on in Settings.";

const SAVE_DEFAULT_MESSAGE =
  "Parfade needs permission to save images to your library. If you previously chose \"Don't Allow,\" you can turn this on in Settings.";

/**
 * Prepares for `launchImageLibraryAsync`:
 * - Uses the system prompt again when the OS allows (`canAskAgain`).
 * - When the user has permanently denied (or the prompt cannot reappear), shows an alert with **Open Settings** (`Linking.openSettings()`).
 */
export async function ensureMediaLibraryPermissionForPicker(
  copy?: MediaLibraryPickerAlertCopy,
): Promise<boolean> {
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();

  if (perm.granted) return true;

  if (perm.canAskAgain) {
    perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.granted) return true;
  }

  Alert.alert(copy?.title ?? DEFAULT_TITLE, copy?.message ?? DEFAULT_MESSAGE, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);

  return false;
}

/**
 * Prepares for `MediaLibrary.saveToLibraryAsync` (write / add-to-library).
 * Same re-prompt + Open Settings pattern as {@link ensureMediaLibraryPermissionForPicker}.
 */
export async function ensureMediaLibraryPermissionForSave(
  copy?: MediaLibraryPickerAlertCopy,
): Promise<boolean> {
  const writeOnly = true;
  let perm = await MediaLibrary.getPermissionsAsync(writeOnly);

  if (perm.granted) return true;

  if (perm.canAskAgain) {
    perm = await MediaLibrary.requestPermissionsAsync(writeOnly);
    if (perm.granted) return true;
  }

  Alert.alert(copy?.title ?? DEFAULT_TITLE, copy?.message ?? SAVE_DEFAULT_MESSAGE, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);

  return false;
}
