import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StandingAvatar } from "./hole-completion-avatars";
import { WolfRecapFunBlock } from "./wolf-recap-fun-block";
import {
  GenericStandingsBlock,
  NassauStandingsBlock,
  SixesStandingsBlock,
  VegasStandingsBlock,
} from "./standings-block";
import {
  calcLowTotal,
  calcStableford,
  calcMatchPlay,
  calcNassauMatch,
  calcSixesSegments,
  calcVegasCombined,
  calcDotsTotal,
  calcTargetsCount,
} from "../../lib/standings-calc";
import { getGameDefinition } from "../../lib/games-registry";
import { letterLabelForUser } from "../../lib/wolf-rotation";
import { computeSkinsTotals, type SkinsTieHandling } from "../../lib/skins-scoring";
import { computeWolfTotals, type WolfTieHandling } from "../../lib/wolf-scoring";
import { buildWolfSessionRecapHighlights } from "../../lib/wolf-session-recap-copy";
import { colors } from "../../lib/theme";
import type { GameHoleRow, GamePlayerRow, GameSessionSummary } from "../../lib/games-api";

function parseWolfLetterOrder(settings: Record<string, unknown>): string[] {
  const raw = settings.wolfLetterOrder;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export type GameSessionRecapStandingsProps = {
  session: GameSessionSummary;
  players: GamePlayerRow[];
  holes: GameHoleRow[];
  gameTypesVersion: number;
  /** Wolf fun block + non-wolf “game finished” blurb (session recap mode). */
  includeRecapExtras: boolean;
  holesLogged: number;
};

export function GameSessionRecapStandings({
  session,
  players,
  holes,
  gameTypesVersion,
  includeRecapExtras,
  holesLogged,
}: GameSessionRecapStandingsProps) {
  const def = useMemo(
    () => getGameDefinition(session.gameType),
    [session.gameType, gameTypesVersion],
  );

  const scoringMode = def?.scoringMode ?? session.gameType;
  const standingsMode = def?.standingsMode ?? session.gameType;
  const holesCount = session.holesCount;
  const wolfLetterOrder =
    scoringMode === "wolf_pick" ? parseWolfLetterOrder(session.settings) : [];

  const holeMap = useMemo(() => new Map(holes.map((h) => [h.holeNumber, h])), [holes]);

  const wolfTieHandling: WolfTieHandling =
    session.settings?.wolfTieHandling === "wash" ? "wash" : "carry";
  const skinsTieHandling: SkinsTieHandling =
    session.settings?.skinsTieHandling === "wash" ? "wash" : "carry";

  const wolfTotals = useMemo(() => {
    if (session.gameType !== "wolf") return null;
    const ids = players.map((p) => p.userId);
    return computeWolfTotals(holes, ids, wolfTieHandling);
  }, [session.gameType, holes, players, wolfTieHandling]);

  const wolfRecapHighlightLines = useMemo(() => {
    if (session.gameType !== "wolf" || wolfTotals == null) return [];
    return buildWolfSessionRecapHighlights(holes, players, wolfTotals);
  }, [session.gameType, holes, players, wolfTotals]);

  const skinsTotals = useMemo(() => {
    if (session.gameType !== "skins") return null;
    const ids = players.map((p) => p.userId);
    return computeSkinsTotals(holes, ids, skinsTieHandling, session.holesCount);
  }, [session.gameType, holes, players, skinsTieHandling, session.holesCount]);

  return (
    <View>
      {standingsMode === "wolf_points" && wolfTotals ? (
        <View style={styles.standingsBlock}>
          <View style={styles.scoreCard}>
            <View style={styles.scoreCardHead}>
              <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
              <Text style={styles.scoreTitle}>Standings</Text>
            </View>
            {players
              .map((p) => ({
                p,
                pts: wolfTotals[p.userId] ?? 0,
                letter:
                  wolfLetterOrder.length > 0
                    ? letterLabelForUser(wolfLetterOrder, p.userId)
                    : null,
              }))
              .sort((a, b) => b.pts - a.pts)
              .map(({ p, pts, letter }, index) => {
                const rank = index + 1;
                return (
                  <View
                    key={p.userId}
                    style={[
                      styles.scoreRow,
                      rank === 1 && styles.scoreRowFirst,
                      rank === 2 && styles.scoreRowSecond,
                      rank === 3 && styles.scoreRowThird,
                    ]}
                  >
                    <View style={styles.scoreRowLeft}>
                      <Text style={[styles.scoreRank, rank <= 3 && styles.scoreRankTop]}>
                        {rank}
                      </Text>
                      <StandingAvatar player={p} size={34} />
                      <Text style={styles.scoreName} numberOfLines={1}>
                        {letter ? <Text style={styles.scoreLetter}>{letter} · </Text> : null}
                        {p.isGuest ? `${p.name} (guest)` : p.name}
                      </Text>
                    </View>
                    <Text style={styles.scorePts}>{pts > 0 ? `+${pts}` : pts}</Text>
                  </View>
                );
              })}
          </View>
        </View>
      ) : null}

      {includeRecapExtras && standingsMode === "wolf_points" ? (
        <WolfRecapFunBlock highlights={wolfRecapHighlightLines} />
      ) : null}

      {standingsMode === "skins_count" && skinsTotals ? (
        <View style={styles.standingsBlock}>
          <View style={styles.scoreCard}>
            <View style={styles.scoreCardHead}>
              <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
              <Text style={styles.scoreTitle}>Skins won</Text>
            </View>
            {players
              .map((p) => ({ p, n: skinsTotals[p.userId] ?? 0 }))
              .sort((a, b) => b.n - a.n)
              .map(({ p, n }, index) => {
                const rank = index + 1;
                return (
                  <View
                    key={p.userId}
                    style={[
                      styles.scoreRow,
                      rank === 1 && styles.scoreRowFirst,
                      rank === 2 && styles.scoreRowSecond,
                      rank === 3 && styles.scoreRowThird,
                    ]}
                  >
                    <View style={styles.scoreRowLeft}>
                      <Text style={[styles.scoreRank, rank <= 3 && styles.scoreRankTop]}>
                        {rank}
                      </Text>
                      <StandingAvatar player={p} size={34} />
                      <Text style={styles.scoreName} numberOfLines={1}>
                        {p.isGuest ? `${p.name} (guest)` : p.name}
                      </Text>
                    </View>
                    <Text style={styles.scorePts}>{n}</Text>
                  </View>
                );
              })}
          </View>
        </View>
      ) : null}

      {standingsMode === "low_total" ? (
        <View style={styles.standingsBlock}>
          <GenericStandingsBlock title="Standings" entries={calcLowTotal(players, holeMap, holesCount)} />
        </View>
      ) : null}

      {standingsMode === "stableford_points" ? (
        <View style={styles.standingsBlock}>
          <GenericStandingsBlock
            title="Points (Stableford)"
            entries={calcStableford(
              players,
              holeMap,
              holesCount,
              Number(session.settings?.coursePar) || 4,
            )}
          />
        </View>
      ) : null}

      {standingsMode === "match_play" ? (
        <View style={styles.standingsBlock}>
          <GenericStandingsBlock title="Match Play" entries={calcMatchPlay(players, holeMap, holesCount)} />
        </View>
      ) : null}

      {standingsMode === "nassau_match" ? (() => {
        const nassau = calcNassauMatch(players, holeMap, holesCount);
        return (
          <View style={styles.standingsBlock}>
            <NassauStandingsBlock front={nassau.front} back={nassau.back} overall={nassau.overall} />
          </View>
        );
      })() : null}

      {standingsMode === "sixes_segments" ? (() => {
        const sixes = calcSixesSegments(players, holeMap);
        return (
          <View style={styles.standingsBlock}>
            <SixesStandingsBlock segments={sixes.segments} playerWins={sixes.playerWins} players={players} />
          </View>
        );
      })() : null}

      {standingsMode === "vegas_combined" ? (
        <View style={styles.standingsBlock}>
          <VegasStandingsBlock
            teams={calcVegasCombined(
              players,
              holeMap,
              holesCount,
              session.settings?.vegasBirdieFlip !== false,
              Number(session.settings?.coursePar) || 4,
            )}
          />
        </View>
      ) : null}

      {standingsMode === "dots_total" ? (
        <View style={styles.standingsBlock}>
          <GenericStandingsBlock title="Dots" entries={calcDotsTotal(players, holeMap, holesCount)} />
        </View>
      ) : null}

      {standingsMode === "targets_count" ? (
        <View style={styles.standingsBlock}>
          <GenericStandingsBlock title="Targets" entries={calcTargetsCount(players, holeMap, holesCount)} />
        </View>
      ) : null}

      {includeRecapExtras && session.gameType !== "wolf" ? (
        <View style={styles.recapBlurb}>
          <Text style={styles.sub}>
            Game finished — {holesLogged} of {holesCount} holes logged. Use hole-by-hole to review or tweak
            scores.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
  scoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreCardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  scoreTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.3,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  scoreRowFirst: {
    backgroundColor: "#f7f2e4",
    borderWidth: 1,
    borderColor: "#e8d9b8",
  },
  scoreRowSecond: {
    backgroundColor: "#f0f1f3",
    borderWidth: 1,
    borderColor: "#e0e2e6",
  },
  scoreRowThird: {
    backgroundColor: "#faf0e8",
    borderWidth: 1,
    borderColor: "#edd9cc",
  },
  scoreRowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  scoreRank: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.muted,
    width: 22,
    textAlign: "center",
  },
  scoreRankTop: { color: colors.fairway },
  scoreLetter: { fontWeight: "800", color: colors.muted },
  scoreName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  scorePts: { fontSize: 17, fontWeight: "800", color: colors.fairway, minWidth: 40, textAlign: "right" },
  standingsBlock: { marginBottom: 16 },
  recapBlurb: { marginBottom: 4 },
});
