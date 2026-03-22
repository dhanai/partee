import type { UserStatsPayload } from "@/lib/build-user-stats";

/** Stat domains shown on profiles; extend when new game types ship. */
export type ProfileStatCategoryId = "wolf" | "skins" | "social";

export type ProfileCategoryStatsBlock = {
  headline: string;
  headlineLabel: string;
  subtitle: string;
  rows: { label: string; value: string }[];
};

export type ProfileStatsGrouped = Record<ProfileStatCategoryId, ProfileCategoryStatsBlock>;

function fmt(n: number): string {
  return n.toLocaleString();
}

/** Shapes flat DB stats into NYT-style category cards + drill-down rows. */
export function buildGroupedProfileStats(s: UserStatsPayload): ProfileStatsGrouped {
  return {
    wolf: {
      headline: fmt(s.wolfGamesCompleted),
      headlineLabel: "Wolf games",
      subtitle: `${fmt(s.wolfPointsTotal)} pts · ${fmt(s.loneWolfHolesWon)} lone · ${fmt(s.partnerWolfHolesWon)} partner`,
      rows: [
        { label: "Games finished", value: fmt(s.wolfGamesCompleted) },
        { label: "Lone wolf wins (holes)", value: fmt(s.loneWolfHolesWon) },
        { label: "Partner wolf wins (holes)", value: fmt(s.partnerWolfHolesWon) },
        { label: "Pack wins (holes)", value: fmt(s.packHolesWon) },
        { label: "Wolf points (lifetime)", value: fmt(s.wolfPointsTotal) },
        { label: "Tie holes (carry / wash)", value: fmt(s.wolfTieHoles) },
      ],
    },
    skins: {
      headline: fmt(s.skinsGamesCompleted),
      headlineLabel: "Skins games",
      subtitle: `${fmt(s.skinsHolesWon)} skins won · ${fmt(s.skinsTieHoles)} pushes`,
      rows: [
        { label: "Games finished", value: fmt(s.skinsGamesCompleted) },
        { label: "Skins won (holes)", value: fmt(s.skinsHolesWon) },
        { label: "Push holes (ties)", value: fmt(s.skinsTieHoles) },
      ],
    },
    social: {
      headline: fmt(s.roundsPlayedCompleted),
      headlineLabel: "Rounds played",
      subtitle: `${fmt(s.distinctCoursesPlayed)} courses · ${fmt(s.gamesCreatedCompleted)} games started`,
      rows: [
        { label: "Rounds hosted", value: fmt(s.roundsHostedCompleted) },
        { label: "Rounds joined", value: fmt(s.roundsJoinedCompleted) },
        { label: "Distinct rounds played", value: fmt(s.roundsPlayedCompleted) },
        { label: "Courses played", value: fmt(s.distinctCoursesPlayed) },
        { label: "Games you started", value: fmt(s.gamesCreatedCompleted) },
        { label: "Holes you logged", value: fmt(s.holesLogged) },
      ],
    },
  };
}
