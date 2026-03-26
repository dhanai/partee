import * as SecureStore from "expo-secure-store";
import { clearCachedMeProfile } from "./me-profile-cache";
import { clearRoundDetailsCache } from "./round-details-cache";
import { clearPublicProfileCache } from "./public-profile-cache";
import { clearMessageCache } from "./message-cache";
import { clearAllInviteSelections } from "./invite-selection-store";
import { clearHousePromoCache } from "./house-promo-api";

const DISCOVER_LOCATION_OVERRIDE_KEY = "discover.location.override.v1";

/**
 * Wipe all user-specific caches (in-memory and persistent).
 * Call before signOut() on every sign-out path.
 */
export async function clearAllCaches(): Promise<void> {
  clearCachedMeProfile();
  clearRoundDetailsCache();
  clearPublicProfileCache();
  clearAllInviteSelections();
  clearHousePromoCache();

  await clearMessageCache();

  try {
    await SecureStore.deleteItemAsync(DISCOVER_LOCATION_OVERRIDE_KEY);
  } catch {
    /* best-effort */
  }
}
