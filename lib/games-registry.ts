/** Aligned with `apps/mobile/lib/games-registry.ts` for web parity. */
export type GameTypeId = "skins" | "wolf" | "best_ball" | "nassau";

export type GameDefinition = {
  id: GameTypeId;
  title: string;
  subtitle: string;
  implemented: boolean;
  minPlayers: number;
  maxPlayers?: number;
};

export const GAME_DEFINITIONS: GameDefinition[] = [
  {
    id: "skins",
    title: "Skins",
    subtitle: "Tap who shot lowest — one takes the skin; two+ tied and it carries.",
    implemented: true,
    minPlayers: 2,
  },
  {
    id: "wolf",
    title: "Wolf",
    subtitle: "Rotating wolf picks a partner or goes lone each hole.",
    implemented: true,
    minPlayers: 4,
    maxPlayers: 4,
  },
  {
    id: "best_ball",
    title: "Best ball",
    subtitle: "Team low ball per hole — coming soon.",
    implemented: false,
    minPlayers: 2,
  },
  {
    id: "nassau",
    title: "Nassau",
    subtitle: "Front, back, and total — coming soon.",
    implemented: false,
    minPlayers: 2,
  },
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return GAME_DEFINITIONS.find((g) => g.id === id);
}
