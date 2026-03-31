import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiBaseUrl, apiGet } from "./api";

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
const STORAGE_KEY = "partee:game-types-v6";

/** Avoid hanging forever when the API host is wrong or unreachable (otherwise UI can spin indefinitely). */
const GAME_TYPES_FETCH_TIMEOUT_MS = 15_000;

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Offline / pre-network fallback only. Subtitle and description are empty so we never show
 * bundled marketing copy that can disagree with the DB. Titles stay as short labels for
 * connectivity-down UX; live copy always comes from GET /api/game-types.
 */
const HARDCODED_SEED: GameTypeConfig[] = [
  {
    slug: "skins",
    title: "Skins",
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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
    subtitle: "",
    description: "",
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

/** Log once per JS runtime so devs can confirm which API host supplies game copy. */
let loggedGameTypesSourceInDev = false;

const gameTypeListeners = new Set<() => void>();
let gameTypesVersion = 0;

export function subscribeGameTypes(listener: () => void) {
  gameTypeListeners.add(listener);
  return () => {
    gameTypeListeners.delete(listener);
  };
}

export function getGameTypesVersionSnapshot(): number {
  return gameTypesVersion;
}

function notifyGameTypesChanged() {
  gameTypesVersion += 1;
  gameTypeListeners.forEach((l) => l());
}

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
        notifyGameTypesChanged();
      }
    }
  } catch {
    // fall through to seed
  }
}

/**
 * Fetches game copy from GET /api/game-types (DB). Call this before reading cached definitions
 * when you need admin/DB text. On failure, hydrates from AsyncStorage or the offline seed.
 *
 * Game copy only matches the database behind {@link apiBaseUrl}. If you edit admin on production
 * but EXPO_PUBLIC_API_BASE_URL points at localhost, you will see your local DB’s copy.
 */
export async function refreshGameTypes(): Promise<GameTypeConfig[]> {
  try {
    const types = (await Promise.race([
      apiGet(`/api/game-types?t=${Date.now()}`, null),
      rejectAfter(GAME_TYPES_FETCH_TIMEOUT_MS, "game-types fetch timeout"),
    ])) as GameTypeConfig[];
    if (Array.isArray(types) && types.length > 0) {
      memoryCache = types;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(types)).catch(() => {});
      notifyGameTypesChanged();
      if (typeof __DEV__ !== "undefined" && __DEV__ && !loggedGameTypesSourceInDev) {
        loggedGameTypesSourceInDev = true;
        console.log(`[Parfade] Game copy loaded from API ${apiBaseUrl} (${types.length} types).`);
      }
    }
    return memoryCache ?? HARDCODED_SEED;
  } catch (e) {
    try {
      await loadGameTypesFromStorage();
    } catch {
      /* ignore */
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[Parfade] GET /api/game-types failed (${msg}) — using cached or offline seed. API base: ${apiBaseUrl}`,
        e,
      );
    }
    return getCachedGameTypes();
  }
}
