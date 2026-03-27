/**
 * Backward-compatible API for game definitions, backed by the API-driven cache.
 */
import type { GameTypeConfig } from "./game-types-cache";
import {
  getCachedGameTypes,
  getGameDefinition as lookupDefinition,
} from "./game-types-cache";

export type GameTypeId = string;

export type GameDefinition = {
  id: string;
  title: string;
  subtitle: string;
  howToPlay: string;
  implemented: boolean;
  minPlayers: number;
  maxPlayers: number;
  scoringMode: string;
  standingsMode: string;
  hasTeams: boolean;
  teamFormation: string | null;
  holesOptions: number[];
  settingsSchema: GameTypeConfig["settingsSchema"];
  defaultSettings: Record<string, unknown>;
};

function toCompat(g: GameTypeConfig): GameDefinition {
  return {
    id: g.slug,
    title: g.title,
    subtitle: g.subtitle,
    howToPlay: g.description,
    implemented: g.enabled,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    scoringMode: g.scoringMode,
    standingsMode: g.standingsMode,
    hasTeams: g.hasTeams,
    teamFormation: g.teamFormation,
    holesOptions: g.holesOptions,
    settingsSchema: g.settingsSchema,
    defaultSettings: g.defaultSettings,
  };
}

export function getGameDefinitions(): GameDefinition[] {
  return getCachedGameTypes().map(toCompat);
}

export function getGameDefinition(slug: string): GameDefinition | undefined {
  const g = lookupDefinition(slug);
  return g ? toCompat(g) : undefined;
}
