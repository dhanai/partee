export type GameTypeId = "skins" | "wolf" | "best_ball" | "nassau";

export type GameDefinition = {
  id: GameTypeId;
  title: string;
  subtitle: string;
  howToPlay: string;
  /** When false, create screen shows coming soon. */
  implemented: boolean;
  /** Total golfers including you (enforced on create + API). */
  minPlayers: number;
  /** Upper bound including you; default 8 when omitted. */
  maxPlayers?: number;
};

export const GAME_DEFINITIONS: GameDefinition[] = [
  {
    id: "skins",
    title: "Skins",
    subtitle: "Tap who shot lowest — one takes the skin; two+ tied and it carries.",
    howToPlay:
      "Each hole is worth one skin. The player with the lowest score on a hole wins the skin. " +
      "If two or more players tie for the lowest score, the skin carries over to the next hole " +
      "(or washes, depending on your settings). At the end, the player with the most skins wins.",
    implemented: true,
    minPlayers: 2,
  },
  {
    id: "wolf",
    title: "Wolf",
    subtitle: "Rotating wolf picks a partner or goes lone each hole.",
    howToPlay:
      "Players rotate as the Wolf each hole. After everyone tees off, the Wolf chooses a partner " +
      "for that hole or goes Lone Wolf. Wolf + partner play against the other two as a team. " +
      "If the Wolf's side wins, they each earn 2 points. If the other side wins, they each earn 3. " +
      "Lone Wolf earns 3 points for a win, but the other three earn 3 each if the Lone Wolf loses.",
    implemented: true,
    minPlayers: 4,
    maxPlayers: 4,
  },
  {
    id: "best_ball",
    title: "Best ball",
    subtitle: "Team low ball per hole — coming soon.",
    howToPlay: "Each team takes the best individual score on every hole. Lowest team total wins.",
    implemented: false,
    minPlayers: 2,
  },
  {
    id: "nassau",
    title: "Nassau",
    subtitle: "Front, back, and total — coming soon.",
    howToPlay: "Three separate bets: front nine, back nine, and overall 18. Win each independently.",
    implemented: false,
    minPlayers: 2,
  },
];

export function getGameDefinition(id: string): GameDefinition | undefined {
  return GAME_DEFINITIONS.find((g) => g.id === id);
}
