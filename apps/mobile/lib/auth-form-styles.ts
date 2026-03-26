import { StyleSheet } from "react-native";
import { colors } from "./theme";

/** Extra offset below safe area for auth logos (welcome + account). */
export const AUTH_LOGO_EXTRA_TOP = 20;

export const authFormStyles = StyleSheet.create({
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
  button: {
    backgroundColor: colors.fairway,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
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
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  switchRow: {
    paddingTop: 8,
    alignItems: "center",
    paddingBottom: 4,
  },
  captchaSlot: {
    minHeight: 78,
    marginTop: 4,
  },
  legalText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  legalLink: {
    color: colors.fairway,
    fontWeight: "600",
  },
});
