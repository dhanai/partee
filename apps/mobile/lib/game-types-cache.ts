import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet } from "./api";

export type GameTypeConfig = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  holesOptions: number[];
  scoringMode: string;
  standingsMode: string;
  hasTeams: boolean;
  teamFormation: string | null;
  settingsSchema: Array<{
    key: string;
    label: string;
    type: "select" | "toggle";
    options?: string[];
    default?: string | boolean;
  }>;
  defaultSettings: Record<string, unknown>;
  sortOrder: number;
  enabled: boolean;
};

/** Bump when clients must drop persisted copy (e.g. after admin copy changes). */
const STORAGE_KEY = "partee:game-types-v2";

const HARDCODED_SEED: GameTypeConfig[] = [
  {
    slug: "skins",
    title: "Skins",
    subtitle: "Tap who shot lowest — one takes the skin; two+ tied and it carries.",
    description:
      "Each hole is worth one skin. The player with the lowest score on a hole wins the skin. " +
      "If two or more players tie for the lowest score, the skin carries over to the next hole " +
      "(or washes, depending on your settings). At the end, the player with the most skins wins.",
    minPlayers: 2,
    maxPlayers: 8,
    holesOptions: [9, 18],
    scoringMode: "pick_lowest",
    standingsMode: "skins_count",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [
      { key: "skinsTieHandling", label: "Tie handling", type: "select", options: ["carry", "wash"], default: "carry" },
    ],
    defaultSettings: { skinsTieHandling: "carry" },
    sortOrder: 0,
    enabled: true,
  },
  {
    slug: "wolf",
    title: "Wolf",
    subtitle: "Rotating wolf picks a partner or goes lone each hole.",
    description:
      "Players rotate as the Wolf each hole. After everyone tees off, the Wolf chooses a partner " +
      "for that hole or goes Lone Wolf. Wolf + partner play against the other two as a team. " +
      "If the Wolf's side wins, they each earn 2 points. If the other side wins, they each earn 3. " +
      "Lone Wolf earns 3 points for a win, but the other three earn 3 each if the Lone Wolf loses.",
    minPlayers: 4,
    maxPlayers: 4,
    holesOptions: [9, 18],
    scoringMode: "wolf_pick",
    standingsMode: "wolf_points",
    hasTeams: true,
    teamFormation: "wolf_rotation",
    settingsSchema: [
      { key: "wolfTeeOff", label: "Wolf tees off", type: "select", options: ["first", "last"], default: "first" },
      { key: "wolfTieHandling", label: "Tie handling", type: "select", options: ["carry", "wash"], default: "carry" },
    ],
    defaultSettings: { wolfTeeOff: "first", wolfTieHandling: "carry" },
    sortOrder: 1,
    enabled: true,
  },
  {
    slug: "nassau",
    title: "Nassau",
    subtitle: "Three matches in one — front 9, back 9, and overall.",
    description:
      "Three separate matches in one round: front nine (holes 1–9), back nine (holes 10–18), and overall 18. " +
      "Each segment is scored as match play — lowest score wins the hole. Win two out of three to take the Nassau.",
    minPlayers: 2,
    maxPlayers: 4,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "nassau_match",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [],
    defaultSettings: {},
    sortOrder: 3,
    enabled: true,
  },
  {
    slug: "sixes",
    title: "Sixes",
    subtitle: "Rotate 2v2 partners every 6 holes.",
    description:
      "Four players pair off and change partners every six holes. Holes 1–6: A & B vs C & D. " +
      "Holes 7–12: A & C vs B & D. Holes 13–18: A & D vs B & C. Each six-hole segment is a " +
      "separate match using best ball. The winner is whoever is on the winning side of at least two segments.",
    minPlayers: 4,
    maxPlayers: 4,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "sixes_segments",
    hasTeams: true,
    teamFormation: "rotating_sixes",
    settingsSchema: [],
    defaultSettings: {},
    sortOrder: 4,
    enabled: true,
  },
  {
    slug: "match",
    title: "Match Play",
    subtitle: "Hole-by-hole — lowest score wins the hole.",
    description:
      "Players compare scores on each hole. The player with the lowest score wins the hole. " +
      "If scores are tied, the hole is halved. A match ends when one player leads by more holes than remain. " +
      "Results are shown as \"3 & 2\" (3 up with 2 to play).",
    minPlayers: 2,
    maxPlayers: 4,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "match_play",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [],
    defaultSettings: {},
    sortOrder: 5,
    enabled: true,
  },
  {
    slug: "vegas",
    title: "Vegas",
    subtitle: "2v2 — combine scores into a two-digit number.",
    description:
      "Four players split into two teams of two. Each team combines their individual hole scores into a " +
      "two-digit number with the lower score first (e.g., a 4 and a 5 becomes 45). The difference between " +
      "team numbers is the point swing. If a team makes a birdie, the losing team's digits flip.",
    minPlayers: 4,
    maxPlayers: 4,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "vegas_combined",
    hasTeams: true,
    teamFormation: "fixed",
    settingsSchema: [
      { key: "vegasBirdieFlip", label: "Birdie flips", type: "toggle", default: true },
    ],
    defaultSettings: { vegasBirdieFlip: true },
    sortOrder: 6,
    enabled: true,
  },
  {
    slug: "dots",
    title: "Dots",
    subtitle: "Earn points for achievements each hole.",
    description:
      "Players earn \"dots\" (points) for specific achievements during the round — birdies, greenies, sandies, " +
      "chip-ins, one-putts, and more. Penalties like three-putts or double bogeys lose dots. " +
      "The player with the most dots at the end wins.",
    minPlayers: 2,
    maxPlayers: 8,
    holesOptions: [9, 18],
    scoringMode: "enter_dots",
    standingsMode: "dots_total",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [],
    defaultSettings: {},
    sortOrder: 7,
    enabled: true,
  },
  {
    slug: "rolling_stroke",
    title: "Rolling Stroke",
    subtitle: "Stroke play with running totals.",
    description:
      "Standard stroke play where each player enters their score per hole. " +
      "The player with the lowest total strokes at the end wins.",
    minPlayers: 2,
    maxPlayers: 8,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "low_total",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [],
    defaultSettings: {},
    sortOrder: 8,
    enabled: true,
  },
  {
    slug: "points",
    title: "Points",
    subtitle: "Stableford scoring — highest points wins.",
    description:
      "Players earn points based on their score relative to par on each hole. " +
      "Double bogey or worse = 0 pts, bogey = 1 pt, par = 2 pts, birdie = 3 pts, eagle = 4 pts. " +
      "The player with the highest total points wins.",
    minPlayers: 2,
    maxPlayers: 8,
    holesOptions: [9, 18],
    scoringMode: "enter_strokes",
    standingsMode: "stableford_points",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [
      { key: "coursePar", label: "Course par per hole", type: "select", options: ["3", "4", "5"], default: "4" },
    ],
    defaultSettings: { coursePar: "4" },
    sortOrder: 9,
    enabled: true,
  },
  {
    slug: "targets",
    title: "Targets",
    subtitle: "Pick a stat and track it hole-by-hole.",
    description:
      "Players pick a target category — fairways hit, greens in regulation, pars or better, or birdies. " +
      "Each hole, mark whether you hit the target. The player with the most hits at the end wins.",
    minPlayers: 2,
    maxPlayers: 8,
    holesOptions: [9, 18],
    scoringMode: "enter_targets",
    standingsMode: "targets_count",
    hasTeams: false,
    teamFormation: null,
    settingsSchema: [
      { key: "targetCategory", label: "Target category", type: "select", options: ["fairways", "greens", "pars", "birdies"], default: "pars" },
    ],
    defaultSettings: { targetCategory: "pars" },
    sortOrder: 10,
    enabled: true,
  },
];

let memoryCache: GameTypeConfig[] | null = null;

export function getCachedGameTypes(): GameTypeConfig[] {
  return memoryCache ?? HARDCODED_SEED;
}

export function getGameDefinition(slug: string): GameTypeConfig | undefined {
  return getCachedGameTypes().find((g) => g.slug === slug);
}

export async function loadGameTypesFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameTypeConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache = parsed;
      }
    }
  } catch {
    // fall through to seed
  }
}

export async function refreshGameTypes(): Promise<GameTypeConfig[]> {
  try {
    const types = (await apiGet("/api/game-types", null)) as GameTypeConfig[];
    if (Array.isArray(types) && types.length > 0) {
      memoryCache = types;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(types)).catch(() => {});
    }
    return memoryCache ?? HARDCODED_SEED;
  } catch {
    return getCachedGameTypes();
  }
}
