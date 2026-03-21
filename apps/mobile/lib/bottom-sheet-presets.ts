import { Dimensions, Easing } from "react-native";

/** Dimming layer behind app bottom sheets (multiplied by animated opacity 0→1). */
export const BOTTOM_SHEET_BACKDROP_COLOR = "rgba(0,0,0,0.42)";

/** Off-screen offset for slide animation (enough to clear typical sheet height). */
export function bottomSheetSlideDistance(): number {
  return Math.min(420, Math.round(Dimensions.get("window").height * 0.5));
}

/** Same curve for open, close, and other bottom-anchored panels (e.g. auth sheets). */
export const BOTTOM_SHEET_EASING = Easing.inOut(Easing.cubic);

/** Shared motion: fade backdrop + slide panel (timing only — no spring overshoot). */
export const bottomSheetOpenAnimation = {
  backdrop: {
    duration: 260,
    easing: BOTTOM_SHEET_EASING,
  },
  sheet: {
    duration: 280,
    easing: BOTTOM_SHEET_EASING,
  },
} as const;

export const bottomSheetCloseAnimation = {
  backdrop: { duration: 220, easing: BOTTOM_SHEET_EASING },
  sheet: { duration: 240, easing: BOTTOM_SHEET_EASING },
} as const;
