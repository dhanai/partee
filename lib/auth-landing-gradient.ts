/**
 * Same dimming overlay as `apps/mobile/components/auth-landing-background.tsx`
 * (OVERLAY_RGB 15,36,24 — matches `colors.authLandingBackground` #0f2418).
 */
const OVERLAY_RGB = "15, 36, 24";
const OVERLAY_TOP_ALPHA = 0.14;
const OVERLAY_BOTTOM_ALPHA = 0.82;

function overlayAlphaAt(t: number): number {
  const curved = Math.pow(Math.max(0, Math.min(1, t)), 1.18);
  return OVERLAY_TOP_ALPHA + (OVERLAY_BOTTOM_ALPHA - OVERLAY_TOP_ALPHA) * curved;
}

/** CSS `background-image` linear-gradient for use over the hero photo. */
export function authLandingGradientBackgroundImage(): string {
  const stops = [0, 0.22, 0.45, 0.68, 0.88, 1].map((pos) => {
    const a = overlayAlphaAt(pos);
    return `rgba(${OVERLAY_RGB},${a.toFixed(3)}) ${(pos * 100).toFixed(2)}%`;
  });
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}
