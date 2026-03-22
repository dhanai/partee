import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { apiGet, toAbsoluteUrl } from "../../../lib/api";
import { createGameSession } from "../../../lib/games-api";
import { getGameDefinition, type GameTypeId } from "../../../lib/games-registry";
import type { RoundDetails } from "../../../types/round";
import { colors } from "../../../lib/theme";

type NetworkFriend = { id: string; name: string; avatar: string | null };

export default function CreateGameScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { gameType, roundInviteToken } = useLocalSearchParams<{
    gameType?: string;
    roundInviteToken?: string;
  }>();

  const def = gameType ? getGameDefinition(gameType) : undefined;
  const [friends, setFriends] = useState<NetworkFriend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roundLockedIds, setRoundLockedIds] = useState<string[] | null>(null);
  const [roundDetails, setRoundDetails] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One string per write-in row; server assigns stable ids. */
  const [guestInputs, setGuestInputs] = useState<string[]>([]);

  const toggle = useCallback((id: string) => {
    if (roundLockedIds) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [roundLockedIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");

        if (roundInviteToken) {
          const res = await apiGet<{ round: RoundDetails }>(
            `/api/rounds/${encodeURIComponent(String(roundInviteToken))}`,
            token,
          );
          const round = res.round;
          if (cancelled) return;
          const ids = new Set<string>();
          ids.add(round.hostId);
          for (const p of round.confirmedPlayers) ids.add(p.id);
          const list = [...ids];
          setRoundDetails(round);
          setRoundLockedIds(list);
          setSelected(new Set(list));
        } else {
          const res = await apiGet<{ friends: NetworkFriend[] }>("/api/users/me/network", token);
          if (cancelled) return;
          setFriends(res.friends ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, roundInviteToken]);

  const registeredCount =
    roundLockedIds != null ? roundLockedIds.length : 1 + selected.size;
  const maxGuestSlots = Math.max(0, 8 - registeredCount);
  const guestFilled = guestInputs.filter((s) => s.trim().length > 0).length;

  useEffect(() => {
    setGuestInputs((prev) =>
      prev.length > maxGuestSlots ? prev.slice(0, maxGuestSlots) : prev,
    );
  }, [maxGuestSlots]);

  const minPlayers = def?.minPlayers ?? 2;
  const totalPlayers = registeredCount + guestFilled;
  const hasEnoughPlayers = Boolean(def) && totalPlayers >= minPlayers;
  const canStart = Boolean(def) && !loading && !submitting && hasEnoughPlayers;

  const addGuestRow = useCallback(() => {
    setGuestInputs((prev) => (prev.length < maxGuestSlots ? [...prev, ""] : prev));
  }, [maxGuestSlots]);

  const removeGuestRow = useCallback((index: number) => {
    setGuestInputs((prev) => prev.filter((_, j) => j !== index));
  }, []);

  const setGuestLine = useCallback((index: number, text: string) => {
    setGuestInputs((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  }, []);

  async function submit() {
    if (!def?.implemented || !gameType) return;
    setError(null);
    const playerUserIds = roundLockedIds ?? [...selected];
    const guestNames = guestInputs.map((s) => s.trim()).filter(Boolean);
    if (totalPlayers < minPlayers) {
      setError(
        `${def.title} needs at least ${minPlayers} golfers (Parfade + guests). You have ${totalPlayers}.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const body: Parameters<typeof createGameSession>[1] = {
        gameType: gameType as GameTypeId,
        playerUserIds,
        ...(guestNames.length > 0 ? { guestNames } : {}),
      };
      if (roundInviteToken) {
        body.roundInviteToken = String(roundInviteToken);
      }
      const created = await createGameSession(token, body);
      router.replace({
        pathname: "/(tabs)/games/session/[sessionId]",
        params: { sessionId: created.session.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create game");
    } finally {
      setSubmitting(false);
    }
  }

  if (!gameType || !def) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing game type.</Text>
      </View>
    );
  }

  if (!def.implemented) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{def.title}</Text>
        <Text style={styles.muted}>This format isn’t available yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.head}>{def.title}</Text>
      <Text style={styles.sub}>{def.subtitle}</Text>

      {loading ? (
        <ActivityIndicator color={colors.fairway} style={styles.loader} />
      ) : roundLockedIds ? (
        <>
          <Text style={styles.label}>Players (from this round)</Text>
          {roundLockedIds.map((id) => {
            const label =
              roundDetails?.confirmedPlayers.find((p) => p.id === id)?.name ??
              (roundDetails?.hostId === id ? roundDetails.hostName : null) ??
              id;
            return (
              <View key={id} style={styles.lockedRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.fairway} />
                <Text style={styles.lockedName} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            );
          })}
          <Text style={styles.hint}>
            Everyone listed is included. {def.title} needs at least {minPlayers} golfers
            {totalPlayers < minPlayers
              ? ` (${totalPlayers} right now — add people to the round or pick another format).`
              : "."}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>Who’s playing? (your network)</Text>
          {friends.length === 0 ? (
            <Text style={styles.muted}>
              Follow golfers in Parfade to invite them to side games here.
            </Text>
          ) : (
            friends.map((f) => {
              const on = selected.has(f.id);
              return (
                <Pressable
                  key={f.id}
                  style={[styles.friendRow, on && styles.friendRowOn]}
                  onPress={() => toggle(f.id)}
                >
                  {f.avatar ? (
                    <Image source={{ uri: toAbsoluteUrl(f.avatar) }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {f.name.trim().charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.friendName}>{f.name}</Text>
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={22}
                    color={on ? colors.fairway : colors.muted}
                  />
                </Pressable>
              );
            })
          )}
        </>
      )}

      {!loading ? (
        <View style={styles.guestSection}>
          <Text style={styles.label}>Guest golfers</Text>
          <Text style={styles.mutedSmall}>
            Type a name for someone without a Parfade account. They’re only stored on this game (for
            scores); they won’t get notifications or a profile.
          </Text>
          {guestInputs.map((line, i) => (
            <View key={`g-${i}`} style={styles.guestRow}>
              <TextInput
                style={styles.guestInput}
                placeholder="Name"
                placeholderTextColor={colors.muted}
                value={line}
                onChangeText={(t) => setGuestLine(i, t)}
                autoCapitalize="words"
                autoCorrect
              />
              <Pressable
                onPress={() => removeGuestRow(i)}
                hitSlop={8}
                style={styles.guestRemove}
              >
                <Ionicons name="close-circle" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          {maxGuestSlots > 0 && guestInputs.length < maxGuestSlots ? (
            <Pressable style={styles.addGuestBtn} onPress={addGuestRow}>
              <Ionicons name="add-circle-outline" size={20} color={colors.fairway} />
              <Text style={styles.addGuestBtnText}>Add guest name</Text>
            </Pressable>
          ) : null}
          {maxGuestSlots === 0 ? (
            <Text style={styles.mutedSmall}>Roster full (8 Parfade players) — no guest slots.</Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !hasEnoughPlayers ? (
        <Text style={styles.needMoreHint}>
          {def.title} needs {minPlayers} golfers total ({registeredCount} Parfade
          {guestFilled > 0 ? `, ${guestFilled} guest${guestFilled === 1 ? "" : "s"}` : ""}).
          {maxGuestSlots > 0 ? " Add friends or guest names." : ""}
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.primaryBtn,
          (submitting || !canStart) && styles.primaryBtnDisabled,
        ]}
        onPress={() => void submit()}
        disabled={!canStart}
      >
        <Text style={styles.primaryBtnText}>
          {submitting ? "Starting…" : "Start game"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 8 },
  head: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 10 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  loader: { marginVertical: 24 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  friendRowOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  avatar: { width: 40, height: 40, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 16, fontWeight: "700", color: colors.fairway },
  friendName: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  lockedName: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
  hint: { fontSize: 13, color: colors.muted, marginTop: 8, marginBottom: 16 },
  mutedSmall: { fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: 10 },
  guestSection: { marginTop: 8, marginBottom: 4 },
  guestRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  guestInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  guestRemove: { padding: 4 },
  addGuestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  addGuestBtnText: { fontSize: 15, fontWeight: "600", color: colors.fairway },
  needMoreHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  error: { color: colors.danger, marginBottom: 12, marginTop: 8 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
