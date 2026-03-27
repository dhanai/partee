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

const STORAGE_KEY = "partee:game-types-v1";

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
      {
        key: "skinsTieHandling",
        label: "Tie handling",
        type: "select",
        options: ["carry", "wash"],
        default: "carry",
      },
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
      {
        key: "wolfTeeOff",
        label: "Wolf tees off",
        type: "select",
        options: ["first", "last"],
        default: "first",
      },
      {
        key: "wolfTieHandling",
        label: "Tie handling",
        type: "select",
        options: ["carry", "wash"],
        default: "carry",
      },
    ],
    defaultSettings: { wolfTeeOff: "first", wolfTieHandling: "carry" },
    sortOrder: 1,
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
