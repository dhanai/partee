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
  /** Bottom sheet: aligned with `AnimatedBottomSheetFrame` (radius, border, no grabber). */
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.border,
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
  buttonApple: {
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
    borderWidth: 1.5,
    borderColor: "#000",
  },
  buttonAppleText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
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
