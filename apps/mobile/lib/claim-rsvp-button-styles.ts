import { StyleSheet } from "react-native";
import { colors } from "./theme";

/**
 * Primary/secondary row used on round RSVP (Claim / Decline), finalize, and profile actions.
 * Matches `RoundCourseLocationSheet` copy / directions buttons.
 */
export const claimRsvpButtonStyles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%" },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.fairway,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  primaryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  secondaryText: { fontSize: 15, fontWeight: "600", color: colors.fairway },
  pressed: { opacity: 0.88 },
});
