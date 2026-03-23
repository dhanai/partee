import type { AchievementBadgeDefinition } from "../components/achievement-badge-detail-sheet";

/**
 * Every badge a user can earn. Profile lists all; earned ones use full color and sort first.
 *
 * `DEV_UNLOCKED_BADGE_IDS`: temporary allowlist until the API returns earned ids — leave empty to
 * preview all locked, or add ids (e.g. `["lone_wolf", "skin_hunter"]`) to test the earned state.
 */
export const DEV_UNLOCKED_BADGE_IDS: string[] = [];

const CAT_ORDER: Record<AchievementBadgeDefinition["category"], number> = {
  wolf: 0,
  skins: 1,
  social: 2,
};

export function sortBadgesForProfile(
  defs: AchievementBadgeDefinition[],
  unlockedIds: ReadonlySet<string>,
): AchievementBadgeDefinition[] {
  const rank = new Map(defs.map((d, i) => [d.id, i]));
  return [...defs].sort((a, b) => {
    const ua = unlockedIds.has(a.id) ? 1 : 0;
    const ub = unlockedIds.has(b.id) ? 1 : 0;
    if (ua !== ub) return ub - ua;
    const ca = CAT_ORDER[a.category];
    const cb = CAT_ORDER[b.category];
    if (ca !== cb) return ca - cb;
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  });
}

/** Split catalog into unlocked vs locked, each sorted Wolf → Skins → Parfade (NYT “earned / unearned” sections). */
export function partitionBadgesForGallery(
  catalog: AchievementBadgeDefinition[],
  unlockedIds: ReadonlySet<string>,
): { unlocked: AchievementBadgeDefinition[]; locked: AchievementBadgeDefinition[] } {
  const rank = new Map(catalog.map((d, i) => [d.id, i]));
  const byCategory = (a: AchievementBadgeDefinition, b: AchievementBadgeDefinition) => {
    const ca = CAT_ORDER[a.category];
    const cb = CAT_ORDER[b.category];
    if (ca !== cb) return ca - cb;
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  };
  const unlocked = catalog.filter((b) => unlockedIds.has(b.id)).sort(byCategory);
  const locked = catalog.filter((b) => !unlockedIds.has(b.id)).sort(byCategory);
  return { unlocked, locked };
}

/** Stable catalog order (wolf → skins → social). */
export const ACHIEVEMENT_BADGES_CATALOG: AchievementBadgeDefinition[] = [
  {
    id: "lone_wolf",
    icon: "paw",
    tint: "fairway",
    label: "Lone wolf",
    detailTitle: "Lone wolf",
    category: "wolf",
    howToUnlock:
      "Win wolf holes as the wolf without picking a partner — go alone and take the point. Counts across completed wolf games.",
    detailBodyEarned:
      "You took the hole alone as the wolf and won the point. Stack these when you’re brave enough to skip a partner and still come out on top.",
  },
  {
    id: "partner_wolf",
    icon: "people",
    tint: "sky",
    label: "Partner wolf",
    detailTitle: "Partner wolf",
    category: "wolf",
    howToUnlock:
      "Win holes on Team Wolf after picking a partner from the group. Counts when your side beats the pack in completed wolf games.",
    detailBodyEarned:
      "You won the hole on Team Wolf with a partner picked from the group. Teamwork beats the pack — this badge celebrates those shared wolf wins.",
  },
  {
    id: "wolf_king",
    icon: "trophy",
    tint: "gold",
    label: "Wolf king",
    detailTitle: "Wolf for the day",
    category: "wolf",
    howToUnlock:
      "Finish a completed wolf game with the most wolf points in the group — session trophy for whoever owned the format that round.",
    detailBodyEarned:
      "You finished a full wolf game with the most wolf points in the group. A session trophy for whoever owned the format that round.",
  },
  {
    id: "skin_hunter",
    icon: "flag",
    tint: "sunset",
    label: "Skin hunter",
    detailTitle: "Skin hunter",
    category: "skins",
    howToUnlock:
      "Be the sole winner on skins holes (one clear low) across completed skins games. Lifetime totals add up over time.",
    detailBodyEarned:
      "Each win counts when you’re the sole low score on a skins hole and bank the skin. Lifetime totals add up across every skins game you play.",
  },
  {
    id: "table_setter",
    icon: "trending-up",
    tint: "mustard",
    label: "Table setter",
    detailTitle: "Table setter",
    category: "skins",
    howToUnlock:
      "Win a skin that carried over from earlier tied holes — close the pot after a carry in completed skins games.",
    detailBodyEarned:
      "You won a skin that carried over from earlier tied holes — the pot was fat and you closed it. For the closers who love a stacked skin.",
  },
  {
    id: "push_merchant",
    icon: "hand-left",
    tint: "silver",
    label: "Push merchant",
    detailTitle: "Push merchant",
    category: "skins",
    howToUnlock:
      "Be part of completed skins games where holes push (tied lows, carry or wash). Counts your participation in those chaotic holes.",
    detailBodyEarned:
      "You were there when the skin pushed — tied lows, carry or wash, chaos on the card. A lighthearted nod to the holes that refused to pay out.",
  },
  {
    id: "clean_sweep",
    icon: "ribbon",
    tint: "grape",
    label: "Clean sweep",
    detailTitle: "Clean sweep",
    category: "skins",
    howToUnlock:
      "In a completed 9-hole skins game, win every skin — you’re the only winner on all nine holes.",
    detailBodyEarned:
      "In a 9-hole skins game you won every skin. Rare air — every hole had a single winner and it was you, start to finish.",
  },
  {
    id: "regular",
    icon: "calendar",
    tint: "bronze",
    label: "Regular",
    detailTitle: "Regular",
    category: "social",
    howToUnlock:
      "Complete side games in Parfade. Tiers unlock as you finish more sessions (any game type counts).",
    detailBodyEarned:
      "Completed side games add up. This one tracks how often you’ve finished games in Parfade — keep the streak going.",
  },
  {
    id: "road_trip",
    icon: "map",
    tint: "midnight",
    label: "Road trip",
    detailTitle: "Road trip",
    category: "social",
    howToUnlock:
      "Link completed games to different courses (via rounds with a course). Unlock when you’ve played enough distinct courses.",
    detailBodyEarned:
      "You’ve logged completed games linked to multiple courses. For golfers who don’t stay in one zip code.",
  },
  {
    id: "home_course",
    icon: "home",
    tint: "fairway",
    label: "Home course",
    detailTitle: "Home course",
    category: "social",
    howToUnlock:
      "Complete many games tied to the same course — for locals who keep coming back to one track.",
    detailBodyEarned:
      "A lot of your finished games tie back to the same course. Locals know the breaks — this badge is for yours.",
  },
  {
    id: "host",
    icon: "gift",
    tint: "ember",
    label: "Host",
    detailTitle: "Host",
    category: "social",
    howToUnlock:
      "Create games that get completed — hosting keeps the group on the tee sheet.",
    detailBodyEarned:
      "You’ve created games for the group and gotten rounds on the board. Hosting keeps the crew playing.",
  },
  {
    id: "plus_one",
    icon: "person-add",
    tint: "sky",
    label: "Plus one",
    detailTitle: "Plus one",
    category: "social",
    howToUnlock:
      "Play in completed games that include a guest — bringing friends along counts.",
    detailBodyEarned:
      "You’ve played in games that included a guest. Bringing friends into the app — even as guests — keeps the party growing.",
  },
  {
    id: "full_squad",
    icon: "people-circle",
    tint: "grape",
    label: "Full squad",
    detailTitle: "Full squad",
    category: "social",
    howToUnlock:
      "Complete a game with four or more people in the group (registered players plus guests).",
    detailBodyEarned:
      "You’ve finished a game with a full foursome (or more). Big groups, big energy.",
  },
  {
    id: "rematch_week",
    icon: "repeat",
    tint: "mustard",
    label: "Rematch",
    detailTitle: "Rematch week",
    category: "social",
    howToUnlock:
      "Complete two games within a week with the same core group — same crew, quick turnaround.",
    detailBodyEarned:
      "Your group played again within seven days. Run it back.",
  },
];
