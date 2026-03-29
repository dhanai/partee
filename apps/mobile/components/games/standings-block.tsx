import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StandingAvatar } from "./hole-completion-avatars";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

type RankedEntry = {
  userId: string;
  player: GamePlayerRow;
  label: string;
};

export function GenericStandingsBlock({
  title,
  entries,
}: {
  title: string;
  entries: RankedEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {entries.map((e, index) => {
        const rank = index + 1;
        return (
          <View
            key={e.userId}
            style={[
              styles.row,
              rank === 1 && styles.rowFirst,
              rank === 2 && styles.rowSecond,
              rank === 3 && styles.rowThird,
            ]}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>{rank}</Text>
              <StandingAvatar player={e.player} size={34} />
              <Text style={styles.name} numberOfLines={1}>
                {e.player.isGuest ? `${e.player.name} (guest)` : e.player.name}
              </Text>
            </View>
            <Text style={styles.value}>{e.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function NassauStandingsBlock({
  front,
  back,
  overall,
}: {
  front: RankedEntry[];
  back: RankedEntry[];
  overall: RankedEntry[];
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
        <Text style={styles.title}>Nassau</Text>
      </View>
      {front.length > 0 ? (
        <>
          <Text style={styles.segmentLabel}>Front 9</Text>
          {front.map((e, i) => (
            <NassauRow key={`f-${e.userId}`} entry={e} rank={i + 1} />
          ))}
        </>
      ) : null}
      {back.length > 0 ? (
        <>
          <Text style={styles.segmentLabel}>Back 9</Text>
          {back.map((e, i) => (
            <NassauRow key={`b-${e.userId}`} entry={e} rank={i + 1} />
          ))}
        </>
      ) : null}
      {overall.length > 0 ? (
        <>
          <Text style={styles.segmentLabel}>Overall</Text>
          {overall.map((e, i) => (
            <NassauRow key={`o-${e.userId}`} entry={e} rank={i + 1} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function NassauRow({ entry, rank }: { entry: RankedEntry; rank: number }) {
  return (
    <View style={[styles.row, rank === 1 && styles.rowFirst]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>{rank}</Text>
        <StandingAvatar player={entry.player} size={30} />
        <Text style={styles.name} numberOfLines={1}>
          {entry.player.isGuest ? `${entry.player.name} (guest)` : entry.player.name}
        </Text>
      </View>
      <Text style={styles.value}>{entry.label}</Text>
    </View>
  );
}

export function SixesStandingsBlock({
  segments,
  playerWins,
  players,
}: {
  segments: Array<{
    label: string;
    teamAScore: number;
    teamBScore: number;
    teamAIds: string[];
    teamBIds: string[];
  }>;
  playerWins: Map<string, number>;
  players: GamePlayerRow[];
}) {
  const byId = new Map(players.map((p) => [p.userId, p]));
  const nameOf = (uid: string) => byId.get(uid)?.name ?? "?";

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
        <Text style={styles.title}>Sixes</Text>
      </View>
      {segments.map((seg) => (
        <View key={seg.label} style={styles.segmentBlock}>
          <Text style={styles.segmentLabel}>{seg.label}</Text>
          <View style={styles.segRow}>
            <Text style={styles.segTeam} numberOfLines={1}>
              {seg.teamAIds.map(nameOf).join(" & ")}
            </Text>
            <Text style={[styles.segScore, seg.teamAScore > seg.teamBScore && styles.segWin]}>
              {seg.teamAScore}
            </Text>
            <Text style={styles.segDash}>–</Text>
            <Text style={[styles.segScore, seg.teamBScore > seg.teamAScore && styles.segWin]}>
              {seg.teamBScore}
            </Text>
            <Text style={styles.segTeam} numberOfLines={1}>
              {seg.teamBIds.map(nameOf).join(" & ")}
            </Text>
          </View>
        </View>
      ))}
      <Text style={[styles.segmentLabel, { marginTop: 8 }]}>Segment wins</Text>
      {players
        .map((p) => ({ p, w: playerWins.get(p.userId) ?? 0 }))
        .sort((a, b) => b.w - a.w)
        .map(({ p, w }, i) => (
          <View key={p.userId} style={[styles.row, i === 0 && styles.rowFirst]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rank, i < 3 && styles.rankTop]}>{i + 1}</Text>
              <StandingAvatar player={p} size={30} />
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            </View>
            <Text style={styles.value}>{w}</Text>
          </View>
        ))}
    </View>
  );
}

export function VegasStandingsBlock({
  teams,
}: {
  teams: Array<{ teamPlayers: GamePlayerRow[]; totalPoints: number }>;
}) {
  if (teams.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="trophy-outline" size={20} color={colors.fairway} />
        <Text style={styles.title}>Vegas</Text>
      </View>
      {teams.map((t, i) => (
        <View key={t.teamPlayers.map((p) => p.userId).join("-")} style={[styles.row, i === 0 && styles.rowFirst]}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rank, i < 3 && styles.rankTop]}>{i + 1}</Text>
            <View style={{ flexDirection: "row", gap: -6 }}>
              {t.teamPlayers.map((p) => (
                <StandingAvatar key={p.userId} player={p} size={30} />
              ))}
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {t.teamPlayers.map((p) => p.name).join(" & ")}
            </Text>
          </View>
          <Text style={styles.value}>{t.totalPoints > 0 ? `+${t.totalPoints}` : t.totalPoints}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ece8e1",
    padding: 16,
    gap: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  rowFirst: { backgroundColor: "#edf4ef" },
  rowSecond: { backgroundColor: "#f6f5f2" },
  rowThird: { backgroundColor: "#faf8f5" },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  rank: {
    width: 20,
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  rankTop: { color: colors.text, fontWeight: "800" },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginLeft: 8,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 10,
  },
  segmentBlock: { gap: 4 },
  segRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  segTeam: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  segScore: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.muted,
    minWidth: 24,
    textAlign: "center",
  },
  segWin: { color: colors.fairway },
  segDash: { fontSize: 14, color: colors.muted },
});
