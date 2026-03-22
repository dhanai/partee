import type { WolfHolePayload } from "@/lib/games/payload-schemas";
import { wolfUserIdForHole, type WolfTeeOff } from "@/lib/games/wolf-rotation";

export function validateWolfPayloadWolfUser(
  settings: Record<string, unknown>,
  holeNumber: number,
  payload: WolfHolePayload,
): string | null {
  const raw = settings.wolfLetterOrder;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const letterOrder = raw.filter((x): x is string => typeof x === "string");
  if (letterOrder.length !== raw.length) return "Invalid wolfLetterOrder in session settings";

  const teeOffRaw = settings.wolfTeeOff;
  const wolfTeeOff: WolfTeeOff =
    teeOffRaw === "last" ? "last" : "first";

  const expected = wolfUserIdForHole(letterOrder, holeNumber, wolfTeeOff);
  if (expected && payload.wolfUserId !== expected) {
    return `Wolf for hole ${holeNumber} must be the scheduled golfer (tee rotation).`;
  }
  return null;
}
