import { StyleSheet } from "react-native";
import { colors } from "./theme";

/**
 * Primary/secondary row used on round RSVP (Claim / Decline) and profile actions.
 */
export const claimRsvpButtonStyles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%" },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButton: { backgroundColor: colors.fairway },
  secondaryButton: { backgroundColor: "#ece8e1" },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondaryText: { color: colors.text, fontWeight: "700" },
});
