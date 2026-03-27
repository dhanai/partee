import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getGameSession,
  patchGameSession,
  type GameSessionSummary,
} from "../../../../lib/games-api";
import type { WolfTeeOff } from "../../../../lib/wolf-rotation";
import { colors } from "../../../../lib/theme";

function normalizeParam(p: string | string[] | undefined): string | undefined {
  if (p == null) return undefined;
  return Array.isArray(p) ? p[0] : p;
}

export default function GameSessionSettingsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const sessionIdRaw = useLocalSearchParams<{ sessionId?: string | string[] }>().sessionId;
  const sessionId = normalizeParam(sessionIdRaw);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<GameSessionSummary | null>(null);

  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  /** User explicitly chose 9/18 chips (avoids PATCHing legacy hole counts by accident). */
  const [holesTouched, setHolesTouched] = useState(false);
  const [wolfTeeOff, setWolfTeeOff] = useState<WolfTeeOff>("first");
  const [wolfTieHandling, setWolfTieHandling] = useState<"carry" | "wash">("carry");
  const [skinsTieHandling, setSkinsTieHandling] = useState<"carry" | "wash">("carry");

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const data = await getGameSession(token, sessionId);
      const s = data.session;
      setSession(s);
      setHolesTouched(false);
      const hc: 9 | 18 = s.holesCount === 9 || s.holesCount === 18 ? s.holesCount : 18;
      setHolesCount(hc);
      setWolfTeeOff(s.settings?.wolfTeeOff === "last" ? "last" : "first");
      setWolfTieHandling(s.settings?.wolfTieHandling === "wash" ? "wash" : "carry");
      setSkinsTieHandling(s.settings?.skinsTieHandling === "wash" ? "wash" : "carry");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!sessionId || !session) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const gameType = session.gameType;
      const body: Parameters<typeof patchGameSession>[2] = {};

      if (
        (gameType === "skins" || gameType === "wolf") &&
        holesTouched &&
        holesCount !== session.holesCount
      ) {
        body.holesCount = holesCount;
      }

      if (gameType === "wolf") {
        const tee = session.settings?.wolfTeeOff === "last" ? "last" : "first";
        const wt = session.settings?.wolfTieHandling === "wash" ? "wash" : "carry";
        if (wolfTeeOff !== tee || wolfTieHandling !== wt) {
          body.settings = { wolfTeeOff, wolfTieHandling };
        }
      }

      if (gameType === "skins") {
        const st = session.settings?.skinsTieHandling === "wash" ? "wash" : "carry";
        if (skinsTieHandling !== st) {
          body.settings = { skinsTieHandling };
        }
      }

      if (Object.keys(body).length === 0) {
        router.back();
        return;
      }

      await patchGameSession(token, sessionId, body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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

  const gameType = session.gameType;
  const legacyHoles =
    session.holesCount !== 9 && session.holesCount !== 18 ? session.holesCount : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.head}>Game settings</Text>
      <Text style={styles.sub}>
        Changes apply to this session for everyone. Hole count cannot drop below a hole that
        already has a score.
      </Text>

      {gameType !== "skins" && gameType !== "wolf" ? (
        <Text style={styles.muted}>
          No adjustable settings for this format in the app yet.
        </Text>
      ) : null}

      {gameType === "skins" || gameType === "wolf" ? (
        <View style={styles.card}>
          <Text style={styles.label}>Holes to play</Text>
          {legacyHoles != null ? (
            <Text style={styles.legacyNote}>
              This session is set to {legacyHoles} holes. You can switch to 9 or 18 if it doesn’t
              conflict with recorded holes.
            </Text>
          ) : null}
          <View style={styles.chipRow}>
            {([9, 18] as const).map((n) => (
              <Pressable
                key={n}
                style={[styles.optChip, holesCount === n && styles.optChipOn]}
                onPress={() => {
                  setHolesCount(n);
                  setHolesTouched(true);
                }}
              >
                <Text style={[styles.optChipText, holesCount === n && styles.optChipTextOn]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {gameType === "skins" ? (
        <View style={styles.card}>
          <Text style={styles.label}>If the hole ties (low gross)</Text>
          <View style={styles.chipRow}>
            {(
              [
                ["carry", "Carry"],
                ["wash", "Wash"],
              ] as const
            ).map(([v, label]) => (
              <Pressable
                key={v}
                style={[styles.optChip, skinsTieHandling === v && styles.optChipOn]}
                onPress={() => setSkinsTieHandling(v)}
              >
                <Text
                  style={[styles.optChipText, skinsTieHandling === v && styles.optChipTextOn]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {gameType === "wolf" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Wolf tees</Text>
            <View style={styles.chipRow}>
              {(
                [
                  ["first", "Wolf first"],
                  ["last", "Wolf last"],
                ] as const
              ).map(([v, label]) => (
                <Pressable
                  key={v}
                  style={[styles.optChip, wolfTeeOff === v && styles.optChipOn]}
                  onPress={() => setWolfTeeOff(v)}
                >
                  <Text style={[styles.optChipText, wolfTeeOff === v && styles.optChipTextOn]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>If the hole ties (wolf points)</Text>
            <View style={styles.chipRow}>
              {(
                [
                  ["carry", "Carry"],
                  ["wash", "Wash"],
                ] as const
              ).map(([v, label]) => (
                <Pressable
                  key={v}
                  style={[styles.optChip, wolfTieHandling === v && styles.optChipOn]}
                  onPress={() => setWolfTieHandling(v)}
                >
                  <Text
                    style={[styles.optChipText, wolfTieHandling === v && styles.optChipTextOn]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
        onPress={() => void save()}
        disabled={saving || (gameType !== "skins" && gameType !== "wolf")}
      >
        <Text style={styles.primaryBtnText}>{saving ? "Saving…" : "Save"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  head: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  muted: { fontSize: 14, color: colors.muted },
  error: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  legacyNote: { fontSize: 12, color: colors.muted, marginBottom: 8, lineHeight: 18 },
  card: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: "800", color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optChipOn: {
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
  },
  optChipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  optChipTextOn: { color: colors.fairway },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.fairway,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
