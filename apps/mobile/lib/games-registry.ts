export type GameTypeId = "skins" | "wolf" | "best_ball" | "nassau";

export type GameDefinition = {
  id: GameTypeId;
  title: string;
  subtitle: string;
  /** When false, create screen shows coming soon. */
  implemented: boolean;
};

export const GAME_DEFINITIONS: GameDefinition[] = [
  {
    id: "skins",
    title: "Skins",
    subtitle: "Win the hole, carry ties — classic pot builder.",
    implemented: true,
  },
  {
    id: "wolf",
    title: "Wolf",
    subtitle: "Rotating wolf picks a partner or goes lone each hole.",
    implemented: true,
  },
  {
    id: "best_ball",
    title: "Best ball",
    subtitle: "Team low ball per hole — coming soon.",
    implemented: false,
  },
  {
    id: "nassau",
    title: "Nassau",
    subtitle: "Front, back, and total — coming soon.",
    implemented: false,
  },
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return GAME_DEFINITIONS.find((g) => g.id === id);
}
