import {
  PARFADE_WORDMARK_P_GOLD_A,
  PARFADE_WORDMARK_P_GOLD_B,
  PARFADE_WORDMARK_P_GREEN_A,
  PARFADE_WORDMARK_P_GREEN_B,
  PARFADE_WORDMARK_VB_H,
  PARFADE_WORDMARK_VB_W,
} from "@/lib/parfade-wordmark-paths";

type Tone = "default" | "light";

const FILL_GREEN = "#1b3c2a";
const FILL_GOLD = "#c9a32d";

/** Width in px; height follows wordmark aspect ratio. Matches mobile `size="large"` (165). */
export function ParfadeWordmark({
  tone = "default",
  widthPx = 165,
  className,
}: {
  tone?: Tone;
  widthPx?: number;
  className?: string;
}) {
  const light = tone === "light";
  const green = light ? "#f4f1ea" : FILL_GREEN;
  const gold = light ? "#e6c963" : FILL_GOLD;
  const h = (widthPx * PARFADE_WORDMARK_VB_H) / PARFADE_WORDMARK_VB_W;

  return (
    <svg
      className={className}
      width={widthPx}
      height={h}
      viewBox={`0 0 ${PARFADE_WORDMARK_VB_W} ${PARFADE_WORDMARK_VB_H}`}
      role="img"
      aria-label="Parfade"
    >
      <path fill={green} d={PARFADE_WORDMARK_P_GREEN_A} />
      <path fill={green} d={PARFADE_WORDMARK_P_GREEN_B} />
      <path fill={gold} d={PARFADE_WORDMARK_P_GOLD_A} />
      <path fill={gold} d={PARFADE_WORDMARK_P_GOLD_B} />
    </svg>
  );
}
