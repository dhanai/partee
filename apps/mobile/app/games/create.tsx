import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { AnimatedBottomSheetFrame } from "../../components/animated-bottom-sheet-frame";
import { GameSettingsSheetContent, gameSettingsSheetStyles } from "../../components/game-settings-sheet-content";
import { OverflowMenuSheet } from "../../components/overflow-menu-sheet";
import { apiGet, toAbsoluteUrl } from "../../lib/api";
import { createGameSession } from "../../lib/games-api";
import { getGameDefinition, type GameTypeId } from "../../lib/games-registry";
import type { WolfTeeOff } from "../../lib/wolf-rotation";
import type { RoundDetails } from "../../types/round";
import { colors } from "../../lib/theme";
import { getCachedMeProfile } from "../../lib/me-profile-cache";

type NetworkFriend = { id: string; name: string; avatar: string | null };

export default function CreateGameScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const params = useLocalSearchParams<{
    gameType?: string;
    roundInviteToken?: string;
  }>();
  const gameType = typeof params.gameType === "string" ? params.gameType : params.gameType?.[0];
  const roundInviteToken = typeof params.roundInviteToken === "string" ? params.roundInviteToken : params.roundInviteToken?.[0];

  const def = gameType ? getGameDefinition(gameType) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const hasSettings = gameType === "wolf" || gameType === "skins";

  useLayoutEffect(() => {
    navigation.setOptions({
      title: def?.title ?? "New Game",
      headerRight: () => (
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          style={{ paddingHorizontal: 8 }}
          accessibilityLabel="Game options"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, def?.title]);
  const [friends, setFriends] = useState<NetworkFriend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roundLockedIds, setRoundLockedIds] = useState<string[] | null>(null);
  const [roundDetails, setRoundDetails] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestInputs, setGuestInputs] = useState<string[]>([]);
  const [wolfHolesCount, setWolfHolesCount] = useState<9 | 18>(18);
  const [skinsHolesCount, setSkinsHolesCount] = useState<9 | 18>(18);
  const [skinsTieHandling, setSkinsTieHandling] = useState<"carry" | "wash">("carry");
  const [wolfTeeOff, setWolfTeeOff] = useState<WolfTeeOff>("first");
  const [wolfTieHandling, setWolfTieHandling] = useState<"carry" | "wash">("carry");

  const rosterCap = def?.maxPlayers ?? 8;

  const toggle = useCallback(
    (id: string) => {
      const cap = def?.maxPlayers ?? 8;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else {
          if (next.size >= cap) return prev;
          next.add(id);
        }
        return next;
      });
    },
    [def?.maxPlayers],
  );

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Not signed in");

        const networkPromise = apiGet<{ friends: NetworkFriend[] }>("/api/users/me/network", token);
        const roundPromise = roundInviteToken
          ? apiGet<{ round: RoundDetails }>(
              `/api/rounds/${encodeURIComponent(roundInviteToken)}`,
              token,
            )
          : null;

        const [networkRes, roundRes] = await Promise.all([
          networkPromise,
          roundPromise,
        ]);
        if (cancelled) return;

        const me = getCachedMeProfile();
        const meEntry: NetworkFriend | null = me
          ? { id: me.id, name: me.name, avatar: me.avatar }
          : null;
        const networkFriends = networkRes.friends ?? [];
        const friendsWithMe = meEntry
          ? [meEntry, ...networkFriends.filter((f) => f.id !== meEntry.id)]
          : networkFriends;
        setFriends(friendsWithMe);

        if (roundRes) {
          const round = roundRes.round;
          const ids = new Set<string>();
          ids.add(round.hostId);
          for (const p of round.confirmedPlayers) ids.add(p.id);
          setRoundDetails(round);
          setRoundLockedIds([...ids]);
          setSelected(ids);
        } else if (meEntry) {
          setSelected(new Set([meEntry.id]));
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
  }, [roundInviteToken]);

  const registeredCount = selected.size;
  const maxGuestSlots = Math.max(0, rosterCap - registeredCount);
  const guestFilled = guestInputs.filter((s) => s.trim().length > 0).length;

  useEffect(() => {
    setGuestInputs((prev) =>
      prev.length > maxGuestSlots ? prev.slice(0, maxGuestSlots) : prev,
    );
  }, [maxGuestSlots]);

  const minPlayers = def?.minPlayers ?? 2;
  const totalPlayers = registeredCount + guestFilled;
  const wolfRoundOverCap =
    gameType === "wolf" && roundLockedIds != null && roundLockedIds.length > rosterCap;
  const hasEnoughPlayers = Boolean(def) && totalPlayers >= minPlayers;
  const canStart =
    Boolean(def) &&
    !loading &&
    !submitting &&
    hasEnoughPlayers &&
    !wolfRoundOverCap;

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

  const allPlayers = useMemo(() => {
    const friendMap = new Map(friends.map((f) => [f.id, f]));
    const roundOnly: NetworkFriend[] = [];
    if (roundLockedIds && roundDetails) {
      for (const id of roundLockedIds) {
        if (!friendMap.has(id)) {
          const cp = roundDetails.confirmedPlayers.find((p) => p.id === id);
          const name =
            cp?.name ??
            (roundDetails.hostId === id ? roundDetails.hostName : null) ??
            id;
          const avatar = cp?.avatar ?? null;
          roundOnly.push({ id, name, avatar });
        }
      }
    }
    return [...roundOnly, ...friends];
  }, [friends, roundLockedIds, roundDetails]);

  async function submit() {
    if (!def?.implemented || !gameType) return;
    setError(null);
    const playerUserIds = [...selected];
    const guestNames = guestInputs.map((s) => s.trim()).filter(Boolean);
    if (totalPlayers < minPlayers) {
      setError(
        `${def.title} needs at least ${minPlayers} golfers (Parfade + guests). You have ${totalPlayers}.`,
      );
      return;
    }
    if (totalPlayers > rosterCap) {
      setError(
        `${def.title} allows at most ${rosterCap} golfers (Parfade + guests). You have ${totalPlayers}.`,
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
      if (gameType === "wolf") {
        body.holesCount = wolfHolesCount;
        body.settings = {
          wolfTeeOff,
          wolfTieHandling,
        };
      }
      if (gameType === "skins") {
        body.holesCount = skinsHolesCount;
        body.settings = {
          skinsTieHandling,
        };
      }
      if (roundInviteToken) {
        body.roundInviteToken = String(roundInviteToken);
      }
      const created = await createGameSession(token, body);
      router.replace({
        pathname: "/games/session/[sessionId]",
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
        <Text style={styles.muted}>This format isn't available yet.</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.head}>{def.title}</Text>
      <Text style={styles.sub}>{def.subtitle}</Text>

      {loading ? (
        <ActivityIndicator color={colors.fairway} style={styles.loader} />
      ) : (
        <>
          <Text style={styles.label}>
            {roundLockedIds ? "Players" : "Who's playing? (your network)"}
          </Text>
          {gameType === "wolf" ? (
            <Text style={styles.mutedSmall}>
              Pick up to 3 other Parfade golfers (you're the fourth).
            </Text>
          ) : null}
          {roundLockedIds ? (
            <Text style={styles.mutedSmall}>
              Round players are pre-selected. Uncheck anyone who isn't playing.
            </Text>
          ) : null}
          {allPlayers.length === 0 ? (
            <Text style={styles.muted}>
              Follow golfers in Parfade to invite them to side games here.
            </Text>
          ) : (
            allPlayers.map((f) => {
              const on = selected.has(f.id);
              const parfadeFull = !on && selected.size >= rosterCap;
              return (
                <Pressable
                  key={f.id}
                  style={[
                    styles.friendRow,
                    on && styles.friendRowOn,
                    parfadeFull && styles.friendRowDisabled,
                  ]}
                  onPress={() => toggle(f.id)}
                  disabled={parfadeFull}
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
          {wolfRoundOverCap ? (
            <Text style={styles.error}>
              Wolf is limited to {rosterCap} players. Trim the group or choose another game.
            </Text>
          ) : null}
        </>
      )}

      {!loading ? (
        <View style={styles.guestSection}>
          <Text style={styles.label}>Guest golfers</Text>
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
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !hasEnoughPlayers ? (
        <Text style={styles.needMoreHint}>
          {def.title} needs {minPlayers} golfers total. Add friends or guest names.
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
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>Start game</Text>
        )}
      </Pressable>
    </ScrollView>

    <OverflowMenuSheet
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      items={[
        ...(hasSettings
          ? [
              {
                key: "settings",
                label: "Game settings",
                icon: "settings-outline" as keyof typeof Ionicons.glyphMap,
                onPress: () => setSettingsSheetOpen(true),
              },
            ]
          : []),
        {
          key: "how-to-play",
          label: "How to play",
          icon: "help-circle-outline" as keyof typeof Ionicons.glyphMap,
          onPress: () => setHowToPlayOpen(true),
        },
      ]}
    />

    <AnimatedBottomSheetFrame
      visible={settingsSheetOpen}
      onClose={() => setSettingsSheetOpen(false)}
      backdropAccessibilityLabel="Dismiss settings"
      sheetStyle={gameSettingsSheetStyles.sheet}
    >
      <Text style={gameSettingsSheetStyles.title}>Game settings</Text>
      <GameSettingsSheetContent
        gameType={gameType}
        holesCount={gameType === "wolf" ? wolfHolesCount : skinsHolesCount}
        onHolesCountChange={(n) => {
          if (gameType === "wolf") setWolfHolesCount(n);
          else setSkinsHolesCount(n);
        }}
        skinsTieHandling={skinsTieHandling}
        onSkinsTieHandlingChange={setSkinsTieHandling}
        wolfTeeOff={wolfTeeOff}
        onWolfTeeOffChange={setWolfTeeOff}
        wolfTieHandling={wolfTieHandling}
        onWolfTieHandlingChange={setWolfTieHandling}
      />
    </AnimatedBottomSheetFrame>

    <AnimatedBottomSheetFrame
      visible={howToPlayOpen}
      onClose={() => setHowToPlayOpen(false)}
      backdropAccessibilityLabel="Dismiss how to play"
      sheetStyle={gameSettingsSheetStyles.sheet}
    >
      <Text style={gameSettingsSheetStyles.title}>How to play {def.title}</Text>
      <Text style={styles.howToPlayBody}>{def.howToPlay}</Text>
    </AnimatedBottomSheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  howToPlayBody: { fontSize: 15, color: colors.text, lineHeight: 22, paddingBottom: 16 },
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
  friendRowDisabled: { opacity: 0.45 },
  avatar: { width: 40, height: 40, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 16, fontWeight: "700", color: colors.fairway },
  friendName: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
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
