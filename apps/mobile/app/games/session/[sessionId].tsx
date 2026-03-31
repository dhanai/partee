import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
} from "../../../components/animated-bottom-sheet-frame";
import { GameSettingsSheetContent, gameSettingsSheetStyles } from "../../../components/game-settings-sheet-content";
import { GameEndHousePromoModal } from "../../../components/game-end-house-promo-modal";
import {
  HoleCompletionAvatars,
  StandingAvatar,
} from "../../../components/games/hole-completion-avatars";
import { OverflowMenuSheet } from "../../../components/overflow-menu-sheet";
import { SkinsHoleEditor, type SkinsPayload } from "../../../components/games/skins-hole-editor";
import { WolfRecapFunBlock } from "../../../components/games/wolf-recap-fun-block";
import { WolfHoleEditor, type WolfPayload } from "../../../components/games/wolf-hole-editor";
import { EnterStrokesEditor, type EnterStrokesPayload } from "../../../components/games/enter-strokes-editor";
import { DotsHoleEditor, type DotsPayload } from "../../../components/games/dots-hole-editor";
import { TargetsHoleEditor, type TargetsPayload } from "../../../components/games/targets-hole-editor";
import {
  GenericStandingsBlock,
  NassauStandingsBlock,
  SixesStandingsBlock,
  VegasStandingsBlock,
} from "../../../components/games/standings-block";
import {
  calcLowTotal,
  calcStableford,
  calcMatchPlay,
  calcNassauMatch,
  calcSixesSegments,
  calcVegasCombined,
  calcDotsTotal,
  calcTargetsCount,
} from "../../../lib/standings-calc";
import {
  deleteGameSession,
  getGameSession,
  patchGameSession,
  putGameHole,
  updateGameSessionStatus,
  type GameHoleRow,
  type GamePlayerRow,
  type GameSessionSummary,
} from "../../../lib/games-api";
import { holeCompletionAvatarUserIds } from "../../../lib/game-hole-display";
import { getGameDefinition, useGameTypesVersion } from "../../../lib/games-registry";
import { letterLabelForUser } from "../../../lib/wolf-rotation";
import type { WolfTeeOff } from "../../../lib/wolf-rotation";
import { computeSkinsTotals, type SkinsTieHandling } from "../../../lib/skins-scoring";
import { computeWolfTotals, type WolfTieHandling } from "../../../lib/wolf-scoring";
import { buildWolfSessionRecapHighlights } from "../../../lib/wolf-session-recap-copy";
import { getHousePromosCached, isGameEndHousePromoReady, type HousePromoSlotClient } from "../../../lib/house-promo-api";
import { showGameFinishedInterstitialAd } from "../../../lib/parfade-admob";
import { useAbly } from "ably/react";
import { parfadeGameSessionChannel } from "../../../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../../../lib/parfade-ably-messages";
import { emitGamesListShouldRefresh } from "../../../lib/games-list-refresh";
import { useKeyboardHeight } from "../../../lib/use-keyboard-height";
import { colors } from "../../../lib/theme";

function parseWolfLetterOrder(settings: Record<string, unknown>): string[] {
  const raw = settings.wolfLetterOrder;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function normalizeRouteParam(p: string | string[] | undefined): string | undefined {
  if (p == null) return undefined;
  return Array.isArray(p) ? p[0] : p;
}

const SCROLL_PAD = 16;
const HOLE_GRID_GAP = 10;
const HOLE_COLS = 3;

function chunkBy<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function GameSessionScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  /** Root stack (same bar as title “Game” / back to Games). Leaf `useNavigation()` targets an inner navigator for this route depth. */
  const rootNavigation = useNavigation("/");
  const { sessionId: sessionIdRaw, recap: recapRaw } = useLocalSearchParams<{
    sessionId?: string | string[];
    recap?: string | string[];
  }>();
  const sessionId = normalizeRouteParam(sessionIdRaw);
  const recapParam = normalizeRouteParam(recapRaw);
  const { getToken } = useAuth();
  const gameTypesVersion = useGameTypesVersion();
  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const gameTypeSlug = session?.gameType;
  const def = useMemo(
    () => (gameTypeSlug ? getGameDefinition(gameTypeSlug) : undefined),
    [gameTypeSlug, gameTypesVersion],
  );
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [holes, setHoles] = useState<GameHoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorHole, setEditorHole] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [settingsHolesCount, setSettingsHolesCount] = useState<number>(18);
  const [settingsHolesTouched, setSettingsHolesTouched] = useState(false);
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  /** True after interstitial closes until URL has `recap=1` (deep links / sync). */
  const [pendingRecapAfterComplete, setPendingRecapAfterComplete] = useState(false);
  /** Opaque layer during complete → ad so recap is not visible until the ad dismisses. */
  const [adHandoffCover, setAdHandoffCover] = useState(false);
  const [houseGameEndPromo, setHouseGameEndPromo] = useState<HousePromoSlotClient | null>(null);
  const housePromoResolveRef = useRef<(() => void) | null>(null);
  /**
   * After delete starts, ignore GET errors: a slow fetch can finish after the row is gone and the
   * API returns 403 Forbidden — that was the red banner flash above standings.
   */
  const suppressLoadErrorsRef = useRef(false);

  useEffect(() => {
    setSession(null);
    setPlayers([]);
    setHoles([]);
    setError(null);
    setLoading(true);
    setRefreshing(false);
    setPendingRecapAfterComplete(false);
    setAdHandoffCover(false);
    setHouseGameEndPromo(null);
    housePromoResolveRef.current = null;
    suppressLoadErrorsRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (recapParam === "1") {
      setPendingRecapAfterComplete(false);
    }
  }, [recapParam]);

  const load = useCallback(async () => {
    if (!sessionId) {
      setRefreshing(false);
      return;
    }
    try {
      const token = await getToken();
      const data = await getGameSession(token, sessionId);
      setSession(data.session ?? null);
      setPlayers(data.players ?? []);
      setHoles(data.holes ?? []);
      setError(null);
    } catch (e) {
      if (!suppressLoadErrorsRef.current) {
        setError(e instanceof Error ? e.message : "Could not load");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, sessionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const ably = useAbly();
  useEffect(() => {
    if (!sessionId) return;
    const channel = ably.channels.get(parfadeGameSessionChannel(sessionId));
    const handler = (msg: import("ably").Message) => {
      const parsed = parseParfadeRealtimeMessage(msg.data);
      if (parsed?.type === "game-session-updated" && parsed.sessionId === sessionId) {
        if (parsed.reason === "deleted") {
          router.back();
        } else {
          void load();
        }
        emitGamesListShouldRefresh();
      }
    };
    void channel.subscribe("parfade", handler);
    return () => { void channel.unsubscribe("parfade", handler); };
  }, [ably, sessionId, load, router]);

  const recapOnly =
    Boolean(sessionId) &&
    session != null &&
    session.status === "completed" &&
    (recapParam === "1" || pendingRecapAfterComplete);

  useLayoutEffect(() => {
    if (!sessionId || loading || !session) {
      rootNavigation.setOptions({
        title: "Game",
        headerRight: undefined,
        headerRightContainerStyle: undefined,
      });
      return;
    }
    rootNavigation.setOptions({
      title: recapOnly ? "Recap" : "Game",
      headerRightContainerStyle: { paddingRight: 10 },
      headerRight: () => (
        <Pressable
          accessibilityLabel="Game actions"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => setGameMenuOpen(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [rootNavigation, sessionId, loading, session, recapOnly]);

  const holeMap = new Map(holes.map((h) => [h.holeNumber, h]));
  const editorPayload = editorHole != null ? holeMap.get(editorHole) : undefined;

  const wolfTieHandling: WolfTieHandling =
    session?.settings?.wolfTieHandling === "wash" ? "wash" : "carry";
  const skinsTieHandling: SkinsTieHandling =
    session?.settings?.skinsTieHandling === "wash" ? "wash" : "carry";
  const wolfTotals = useMemo(() => {
    if (!session || session.gameType !== "wolf") return null;
    const ids = players.map((p) => p.userId);
    return computeWolfTotals(holes, ids, wolfTieHandling);
  }, [session, holes, players, wolfTieHandling]);

  const wolfRecapHighlightLines = useMemo(() => {
    if (!session || session.gameType !== "wolf" || wolfTotals == null) return [];
    return buildWolfSessionRecapHighlights(holes, players, wolfTotals);
  }, [session, holes, players, wolfTotals]);

  const skinsTotals = useMemo(() => {
    if (!session || session.gameType !== "skins") return null;
    const ids = players.map((p) => p.userId);
    return computeSkinsTotals(holes, ids, skinsTieHandling, session.holesCount);
  }, [session, holes, players, skinsTieHandling]);

  const priorWolfHoles = useMemo(() => {
    if (editorHole == null) return [];
    return holes
      .filter((h) => h.holeNumber < editorHole)
      .sort((a, b) => a.holeNumber - b.holeNumber);
  }, [holes, editorHole]);

  async function saveHole(payload: unknown) {
    if (!sessionId || editorHole == null) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const body: { payload: unknown; expectedVersion?: number } = { payload };
      if (editorPayload) {
        body.expectedVersion = editorPayload.version;
      }
      const res = await putGameHole(token, sessionId, editorHole, body);
      setHoles((prev) => {
        const rest = prev.filter((h) => h.holeNumber !== editorHole);
        return [...rest, res.hole].sort((a, b) => a.holeNumber - b.holeNumber);
      });
      setEditorHole(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("409") || msg.toLowerCase().includes("version")) {
        setError("Someone updated this hole first. Refresh and try again.");
        void load();
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  const dismissHouseGameEndPromo = useCallback(() => {
    setHouseGameEndPromo(null);
    const r = housePromoResolveRef.current;
    housePromoResolveRef.current = null;
    r?.();
  }, []);

  function exitSessionScreen() {
    setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/games");
      }
    }, 0);
  }

  async function markComplete() {
    if (!sessionId || completing) return;
    setCompleting(true);
    setPendingRecapAfterComplete(false);
    setAdHandoffCover(true);
    try {
      const token = await getToken();
      const { session: nextSession } = await updateGameSessionStatus(
        token,
        sessionId,
        "completed",
      );
      // Recap is painted under this full-screen Modal; when ad + Modal clear, recap is already there.
      setSession(nextSession);
      setPendingRecapAfterComplete(true);
      router.setParams({ recap: "1" });
      let promos: Awaited<ReturnType<typeof getHousePromosCached>> | null = null;
      try {
        promos = await getHousePromosCached(true);
      } catch {
        promos = null;
      }
      const ge = promos?.gameEnd;
      if (ge && isGameEndHousePromoReady(ge)) {
        setAdHandoffCover(false);
        await new Promise<void>((resolve) => {
          housePromoResolveRef.current = resolve;
          setHouseGameEndPromo(ge);
        });
      } else {
        await showGameFinishedInterstitialAd();
      }
      let handoffCoverDropped = false;
      const dropHandoffCover = () => {
        if (handoffCoverDropped) return;
        handoffCoverDropped = true;
        setAdHandoffCover(false);
      };
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(dropHandoffCover);
      });
      setTimeout(dropHandoffCover, 1000);
    } catch (e) {
      setPendingRecapAfterComplete(false);
      setError(e instanceof Error ? e.message : "Could not update");
      setAdHandoffCover(false);
    } finally {
      setCompleting(false);
    }
  }

  async function performDeleteGame() {
    if (!sessionId || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    suppressLoadErrorsRef.current = true;
    try {
      const token = await getToken();
      if (!token) {
        suppressLoadErrorsRef.current = false;
        const msg = "Sign in to delete this game.";
        setError(msg);
        Alert.alert("Could not delete", msg);
        return;
      }
      await deleteGameSession(token, sessionId);
      setError(null);
      exitSessionScreen();
    } catch (e) {
      suppressLoadErrorsRef.current = false;
      const msg = e instanceof Error ? e.message : "Could not delete";
      setError(msg);
      Alert.alert("Could not delete", msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openSettingsSheet() {
    if (!session) return;
    setSettingsHolesCount(session.holesCount);
    setSettingsHolesTouched(false);
    setSettingsValues({ ...(session.settings ?? {}) });
    setSettingsSheetOpen(true);
  }

  async function saveSettings() {
    if (!sessionId || !session) return;
    setSettingsSaving(true);
    try {
      const token = await getToken();
      const body: Parameters<typeof patchGameSession>[2] = {};

      if (settingsHolesTouched && settingsHolesCount !== session.holesCount) {
        body.holesCount = settingsHolesCount as 9 | 18;
      }

      const currentSettings = session.settings ?? {};
      const changed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(settingsValues)) {
        if (key === "guestPlayers" || key === "wolfLetterOrder") continue;
        if (currentSettings[key] !== val) changed[key] = val;
      }
      if (Object.keys(changed).length > 0) {
        body.settings = changed as Parameters<typeof patchGameSession>[2]["settings"];
      }

      if (Object.keys(body).length > 0) {
        const result = await patchGameSession(token, sessionId, body);
        setSession(result.session);
      }
      setSettingsSheetOpen(false);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function confirmDeleteGame() {
    Alert.alert(
      "Delete game?",
      "This removes the game and all recorded holes for everyone in the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Defer past alert dismissal — otherwise iOS sometimes never runs the async work.
            setTimeout(() => void performDeleteGame(), 0);
          },
        },
      ],
    );
  }

  if (!sessionId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Missing session.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.fairway} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Not found"}</Text>
      </View>
    );
  }

  const scoringMode = def?.scoringMode ?? session.gameType;
  const standingsMode = def?.standingsMode ?? session.gameType;
  const holesCount = session.holesCount;
  const holeNumbers = Array.from({ length: holesCount }, (_, i) => i + 1);
  const wolfLetterOrder =
    scoringMode === "wolf_pick" ? parseWolfLetterOrder(session.settings) : [];
  const wolfTeeOffUi: WolfTeeOff =
    session.settings?.wolfTeeOff === "last" ? "last" : "first";

  const holeTileSize =
    (windowWidth - SCROLL_PAD * 2 - HOLE_GRID_GAP * (HOLE_COLS - 1)) / HOLE_COLS;
  const holesLogged = holeNumbers.filter((n) => holeMap.has(n)).length;
  const progressPct = holesCount > 0 ? Math.min(100, (holesLogged / holesCount) * 100) : 0;
  const holeRows = chunkBy(holeNumbers, HOLE_COLS);

  /** Skins / Wolf: tap-only editors — size sheet to content (no inner scroll). */
  const holeEditorContentFit =
    scoringMode === "pick_lowest" || scoringMode === "wolf_pick";
  const holeEditorDynamicMax = Math.round(windowHeight - insets.top - 24);

  return (
    <>
      {houseGameEndPromo ? (
        <GameEndHousePromoModal
          visible
          slot={houseGameEndPromo}
          onDismiss={dismissHouseGameEndPromo}
        />
      ) : null}
      <Modal visible={adHandoffCover} animationType="none" transparent={false}>
        <View style={styles.adHandoffModal}>
          <ActivityIndicator color={colors.fairway} size="large" />
        </View>
      </Modal>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scrollRoot}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {def ? (
            <View style={styles.wolfHero}>
              <View style={styles.wolfHeroTop}>
                <View>
                  <Text style={styles.wolfHeroEyebrow}>Side game</Text>
                  <Text style={styles.wolfHeroTitle}>
                    {def.title}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    session.status === "active" ? styles.statusPillLive : styles.statusPillMuted,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      session.status === "active" && styles.statusDotLive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      session.status === "active" && styles.statusPillTextLive,
                    ]}
                  >
                    {session.status === "active" ? "In play" : session.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.wolfHeroSub} numberOfLines={2}>
                {def?.subtitle ?? session.gameType}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.progressCaption}>
                {holesLogged} of {holesCount} holes logged
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.head}>{session.gameType}</Text>
              <Text style={styles.sub}>
                Tap a hole to record results ·{" "}
                {session.status === "active" ? "Active" : session.status}
              </Text>
            </>
          )}

          {error ? <Text style={styles.banner}>{error}</Text> : null}

          {standingsMode === "wolf_points" && wolfTotals ? (
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
                          {letter ? (
                            <Text style={styles.scoreLetter}>{letter} · </Text>
                          ) : null}
                          {p.isGuest ? `${p.name} (guest)` : p.name}
                        </Text>
                      </View>
                      <Text style={styles.scorePts}>{pts > 0 ? `+${pts}` : pts}</Text>
                    </View>
                  );
                })}
            </View>
          ) : null}

          {recapOnly && standingsMode === "wolf_points" ? (
            <WolfRecapFunBlock highlights={wolfRecapHighlightLines} />
          ) : null}

          {standingsMode === "skins_count" && skinsTotals ? (
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
          ) : null}

          {standingsMode === "low_total" ? (
            <GenericStandingsBlock title="Standings" entries={calcLowTotal(players, holeMap, holesCount)} />
          ) : null}

          {standingsMode === "stableford_points" ? (
            <GenericStandingsBlock
              title="Points (Stableford)"
              entries={calcStableford(players, holeMap, holesCount, Number(session.settings?.coursePar) || 4)}
            />
          ) : null}

          {standingsMode === "match_play" ? (
            <GenericStandingsBlock title="Match Play" entries={calcMatchPlay(players, holeMap, holesCount)} />
          ) : null}

          {standingsMode === "nassau_match" ? (() => {
            const nassau = calcNassauMatch(players, holeMap, holesCount);
            return <NassauStandingsBlock front={nassau.front} back={nassau.back} overall={nassau.overall} />;
          })() : null}

          {standingsMode === "sixes_segments" ? (() => {
            const sixes = calcSixesSegments(players, holeMap);
            return <SixesStandingsBlock segments={sixes.segments} playerWins={sixes.playerWins} players={players} />;
          })() : null}

          {standingsMode === "vegas_combined" ? (
            <VegasStandingsBlock
              teams={calcVegasCombined(
                players, holeMap, holesCount,
                session.settings?.vegasBirdieFlip !== false,
                Number(session.settings?.coursePar) || 4,
              )}
            />
          ) : null}

          {standingsMode === "dots_total" ? (
            <GenericStandingsBlock title="Dots" entries={calcDotsTotal(players, holeMap, holesCount)} />
          ) : null}

          {standingsMode === "targets_count" ? (
            <GenericStandingsBlock title="Targets" entries={calcTargetsCount(players, holeMap, holesCount)} />
          ) : null}

          {recapOnly && session.gameType !== "wolf" ? (
            <View style={styles.recapBlurb}>
              <Text style={styles.sub}>
                Game finished — {holesLogged} of {holesCount} holes logged. Use hole-by-hole to review
                or tweak scores.
              </Text>
            </View>
          ) : null}

          {recapOnly ? (
            <Pressable
              style={styles.completeBtn}
              onPress={() => {
                if (!sessionId) return;
                setPendingRecapAfterComplete(false);
                router.push({
                  pathname: "/games/session/[sessionId]",
                  params: { sessionId },
                });
              }}
            >
              <Text style={styles.completeBtnText}>Hole-by-hole breakdown</Text>
            </Pressable>
          ) : null}

          {!recapOnly ? (
            <View style={styles.holesSection}>
              <View style={styles.holesSectionHead}>
                <Text style={styles.holesSectionTitle}>Holes</Text>
                <Text style={styles.holesSectionMeta}>
                  {holesLogged}/{holesCount} done
                </Text>
              </View>
              {holeRows.map((row, ri) => (
                <View
                  key={`row-${ri}`}
                  style={[styles.holeGridRow, { marginBottom: HOLE_GRID_GAP, gap: HOLE_GRID_GAP }]}
                >
                  {row.map((n) => {
                    const h = holeMap.get(n);
                    const label = h ? `Hole ${n}, logged` : `Hole ${n}, not logged`;
                    const avatarSize = Math.max(20, Math.min(26, Math.round(holeTileSize * 0.24)));
                    const avatarOverlap = Math.max(7, Math.round(holeTileSize * 0.085));
                    const completionIds =
                      h != null
                        ? holeCompletionAvatarUserIds(
                            session.gameType,
                            h.payload as Record<string, unknown>,
                            players,
                            scoringMode,
                          )
                        : [];
                    return (
                      <Pressable
                        key={n}
                        accessibilityLabel={label}
                        accessibilityRole="button"
                        style={[
                          styles.holeTile,
                          {
                            width: holeTileSize,
                            minHeight: holeTileSize * 0.88,
                          },
                          h ? styles.holeTileDone : styles.holeTileOpen,
                        ]}
                        onPress={() => setEditorHole(n)}
                      >
                        <Text style={[styles.holeTileNum, h && styles.holeTileNumDone]}>{n}</Text>
                        {h ? (
                          <HoleCompletionAvatars
                            userIds={completionIds}
                            players={players}
                            size={avatarSize}
                            overlap={avatarOverlap}
                          />
                        ) : (
                          <Text style={styles.holeTileHint}>Tap</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}

          {session.status === "active" ? (
            <Pressable
              style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
              onPress={() => void markComplete()}
              disabled={completing}
            >
              {completing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.completeBtnText}>Mark complete</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>

        <AnimatedBottomSheetFrame
          visible={editorHole != null}
          onClose={() => {
            if (!saving) setEditorHole(null);
          }}
          backdropAccessibilityLabel="Dismiss hole editor"
          snapPoints={undefined}
          maxDynamicContentSize={holeEditorDynamicMax}
          keyboardBehavior={holeEditorContentFit ? undefined : "extend"}
          keyboardBlurBehavior={holeEditorContentFit ? undefined : "restore"}
          topInset={insets.top}
          enableContentPanningGesture={false}
          dragHandle
          sheetStyle={styles.holeEditorSheet}
          backgroundStyle={styles.holeEditorBackground}
        >
          {holeEditorContentFit ? (
            saving ? (
              <ActivityIndicator color={colors.fairway} style={{ marginVertical: 20 }} />
            ) : scoringMode === "pick_lowest" && editorHole != null ? (
              <SkinsHoleEditor
                holeNumber={editorHole}
                players={players}
                tieHandling={skinsTieHandling}
                initial={
                  (editorPayload?.payload as SkinsPayload | { result: "carry"; winnerUserIds?: string[] }) ??
                  null
                }
                onCancel={() => setEditorHole(null)}
                onSave={(p) => void saveHole(p)}
              />
            ) : scoringMode === "wolf_pick" && editorHole != null ? (
              <WolfHoleEditor
                holeNumber={editorHole}
                letterOrderUserIds={wolfLetterOrder}
                wolfTeeOff={wolfTeeOffUi}
                tieHandling={wolfTieHandling}
                priorHoles={priorWolfHoles}
                players={players}
                initial={(editorPayload?.payload as WolfPayload) ?? null}
                onCancel={() => setEditorHole(null)}
                onSave={(p) => void saveHole(p)}
              />
            ) : null
          ) : (
            <>
              {session.gameType !== "wolf" && session.gameType !== "skins" ? (
                <Text style={styles.holeEditorTitle}>Hole {editorHole}</Text>
              ) : null}
              <BottomSheetScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces={false}
                contentContainerStyle={[
                  styles.holeEditorScrollContent,
                  keyboardHeight > 0 && {
                    paddingBottom: 28 + keyboardHeight,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.fairway} style={{ marginVertical: 20 }} />
                ) : scoringMode === "enter_strokes" && editorHole != null ? (
                  <EnterStrokesEditor
                    players={players}
                    initial={(editorPayload?.payload as EnterStrokesPayload) ?? null}
                    onCancel={() => setEditorHole(null)}
                    onSave={(p) => void saveHole(p)}
                  />
                ) : scoringMode === "enter_dots" && editorHole != null ? (
                  <DotsHoleEditor
                    players={players}
                    initial={(editorPayload?.payload as DotsPayload) ?? null}
                    onCancel={() => setEditorHole(null)}
                    onSave={(p) => void saveHole(p)}
                  />
                ) : scoringMode === "enter_targets" && editorHole != null ? (
                  <TargetsHoleEditor
                    players={players}
                    category={String(session.settings?.targetCategory ?? "pars")}
                    initial={(editorPayload?.payload as TargetsPayload) ?? null}
                    onCancel={() => setEditorHole(null)}
                    onSave={(p) => void saveHole(p)}
                  />
                ) : (
                  <Text style={styles.muted}>
                    Editing for this game is not supported in this app version.
                  </Text>
                )}
              </BottomSheetScrollView>
            </>
          )}
        </AnimatedBottomSheetFrame>

        <OverflowMenuSheet
          visible={gameMenuOpen}
          onClose={() => setGameMenuOpen(false)}
          items={[
            {
              key: "settings",
              label: "Game settings",
              icon: "settings-outline" as const,
              onPress: () => openSettingsSheet(),
            },
            {
              key: "how-to-play",
              label: "How to play",
              icon: "help-circle-outline" as const,
              onPress: () => setHowToPlayOpen(true),
            },
            {
              key: "delete",
              label: "Delete game",
              icon: "trash-outline" as const,
              destructive: true,
              onPress: () => {
                if (!deleteBusy) confirmDeleteGame();
              },
            },
          ]}
        />

        <AnimatedBottomSheetFrame
          visible={howToPlayOpen}
          onClose={() => setHowToPlayOpen(false)}
          backdropAccessibilityLabel="Dismiss how to play"
          sheetStyle={styles.howToPlaySheet}
        >
          <Text style={styles.howToPlayTitle}>How to play {def?.title ?? session.gameType}</Text>
          <Text style={styles.howToPlayBody}>
            {def?.howToPlay ?? "No instructions available for this game."}
          </Text>
        </AnimatedBottomSheetFrame>

        <AnimatedBottomSheetFrame
          visible={settingsSheetOpen}
          onClose={() => { if (!settingsSaving) setSettingsSheetOpen(false); }}
          backdropAccessibilityLabel="Dismiss game settings"
          sheetStyle={gameSettingsSheetStyles.sheet}
        >
          <Text style={gameSettingsSheetStyles.title}>Game settings</Text>
          <GameSettingsSheetContent
            holesOptions={(def?.holesOptions ?? [9, 18]) as number[]}
            holesCount={settingsHolesCount}
            onHolesCountChange={(n) => { setSettingsHolesCount(n); setSettingsHolesTouched(true); }}
            settingsSchema={def?.settingsSchema ?? []}
            settings={settingsValues}
            onSettingChange={(key, value) =>
              setSettingsValues((prev) => ({ ...prev, [key]: value }))
            }
          />
          <Pressable
            style={[styles.settingsSaveBtn, settingsSaving && { opacity: 0.5 }]}
            onPress={() => void saveSettings()}
            disabled={settingsSaving}
          >
            <Text style={styles.settingsSaveBtnText}>{settingsSaving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </AnimatedBottomSheetFrame>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  /** Full-screen Modal above stack header during complete → interstitial. */
  adHandoffModal: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollRoot: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SCROLL_PAD,
    paddingTop: SCROLL_PAD,
    paddingBottom: 36,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  wolfHero: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: colors.fairway,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  wolfHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  wolfHeroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  wolfHeroTitle: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  wolfHeroSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 20,
    marginTop: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  statusPillLive: { backgroundColor: "rgba(255,255,255,0.28)" },
  statusPillMuted: { backgroundColor: "rgba(255,255,255,0.15)" },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  statusDotLive: { backgroundColor: "#7dffb1" },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    textTransform: "capitalize",
  },
  statusPillTextLive: { color: "#fff" },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#b8f5d0",
  },
  progressCaption: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    marginTop: 8,
  },
  head: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
  scoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 16,
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
  holesSection: { marginBottom: 8 },
  holesSectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  holesSectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  holesSectionMeta: { fontSize: 13, fontWeight: "600", color: colors.muted },
  holeGridRow: { flexDirection: "row", flexWrap: "nowrap" },
  holeTile: {
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 4,
  },
  holeTileOpen: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  holeTileDone: {
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
  },
  holeTileNum: { fontSize: 20, fontWeight: "800", color: colors.text },
  holeTileNumDone: { color: colors.fairway },
  holeTileHint: { fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  banner: { color: colors.danger, marginBottom: 8 },
  error: { color: colors.danger },
  muted: { fontSize: 14, color: colors.muted },
  recapBlurb: { marginBottom: 4 },
  completeBtnDisabled: {
    opacity: 0.75,
  },
  completeBtn: {
    marginTop: 20,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.fairway,
  },
  completeBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  holeEditorSheet: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  holeEditorScrollContent: {
    paddingBottom: 28,
  },
  holeEditorBackground: {
    backgroundColor: colors.background,
  },
  holeEditorTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 6 },
  howToPlaySheet: { paddingHorizontal: 16, paddingTop: 8 },
  howToPlayTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 14 },
  howToPlayBody: { fontSize: 15, color: colors.text, lineHeight: 22, paddingBottom: 16 },
  settingsSaveBtn: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.fairway,
    alignItems: "center" as const,
  },
  settingsSaveBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
