import type { ProfileStatCategoryId } from "./profile-stats-api";
import { colors } from "./theme";

export const PROFILE_STAT_THEMES: Record<
  ProfileStatCategoryId,
  { icon: "paw" | "flag" | "people"; bg: string; border: string; accent: string }
> = {
  wolf: {
    icon: "paw",
    bg: colors.fairwaySoft,
    border: "#c5dccf",
    accent: colors.fairway,
  },
  skins: {
    icon: "flag",
    bg: "#fef6f2",
    border: "#f0cfc0",
    accent: "#a34a2f",
  },
  social: {
    icon: "people",
    bg: "#eef4fb",
    border: "#c8d8ec",
    accent: "#2a4d82",
  },
};

export const PROFILE_STAT_LABELS: Record<ProfileStatCategoryId, string> = {
  wolf: "Wolf",
  skins: "Skins",
  social: "Parfade",
};
