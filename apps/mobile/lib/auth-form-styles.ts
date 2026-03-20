import { StyleSheet } from "react-native";
import { colors } from "./theme";

/** Extra offset below safe area for auth logos (welcome + account). */
export const AUTH_LOGO_EXTRA_TOP = 20;

export const authFormStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.authLandingBackground,
  },
  logoHeader: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  keyboardFill: {
    flex: 1,
  },
  sheetScrollContent: {
    flex: 1,
    justifyContent: "flex-end",
  },
  /** Bottom sheet: pinned to bottom, rounded top only */
  bottomSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 22,
    gap: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(15, 36, 24, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 18,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(28, 28, 30, 0.12)",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.6,
    marginTop: 4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 2,
  },
  input: {
    backgroundColor: "#f4f2ee",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: "rgba(28, 28, 30, 0.08)",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  /** Inverted: light surface + fairway label (was green fill + white text) */
  button: {
    backgroundColor: "#eef4ef",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
    borderWidth: 1,
    borderColor: "rgba(26, 60, 42, 0.2)",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  /** Fairway outline on white sheet */
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
    borderWidth: 1.5,
    borderColor: colors.fairway,
  },
  buttonSecondaryText: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 16,
  },
  buttonSecondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(28, 28, 30, 0.12)",
  },
  dividerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  buttonText: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 16,
  },
  switchRow: {
    paddingTop: 8,
    alignItems: "center",
    paddingBottom: 4,
  },
  switchText: {
    color: colors.authLandingBackground,
    fontWeight: "600",
    fontSize: 15,
  },
  captchaSlot: {
    minHeight: 78,
    marginTop: 4,
  },
});
