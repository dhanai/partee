import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "./animated-bottom-sheet-frame";
import { apiGet } from "../lib/api";
import { colors } from "../lib/theme";

export type GiphyPickerItem = {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
  width: number;
  height: number;
};

const SNAP_POINTS = ["65%"] as const;

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: GiphyPickerItem) => void | Promise<void>;
};

export function GiphyPickerSheet({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [query, setQuery] = useState("");
  const debounceMs = query.trim() ? 320 : 0;
  const debouncedQuery = useDebounce(query, debounceMs);
  const [results, setResults] = useState<GiphyPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const q = debouncedQuery.trim();
        const path = q
          ? `/api/giphy/search?q=${encodeURIComponent(q)}`
          : "/api/giphy/search";
        const json = await apiGet<{ results: GiphyPickerItem[]; error?: string }>(path, token);
        if (cancelled) return;
        setResults(Array.isArray(json.results) ? json.results : []);
        if (json.error && typeof json.error === "string") {
          setError(json.error);
        }
      } catch (e) {
        if (cancelled) return;
        setResults([]);
        setError(e instanceof Error ? e.message : "Could not load GIFs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, debouncedQuery]);

  const handlePick = useCallback(
    (item: GiphyPickerItem) => {
      void onSelect(item);
    },
    [onSelect],
  );

  const pad = 12;
  const gap = 6;
  const colW = (windowWidth - pad * 2 - gap) / 2;

  return (
    <AnimatedBottomSheetFrame
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      topInset={insets.top}
      enableContentPanningGesture={false}
      backdropAccessibilityLabel="Close GIF picker"
    >
      <View style={styles.header}>
        <BottomSheetTextInput
          style={styles.search}
          placeholder="Search GIPHY"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: pad, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={[styles.grid, { gap }]}>
            {results.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handlePick(item)}
                style={[styles.cell, { width: colW, height: colW * 0.75 }]}
                accessibilityLabel={item.title || "GIF"}
              >
                <Image
                  source={item.previewUrl}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={100}
                />
              </Pressable>
            ))}
          </View>
          {!loading && results.length === 0 ? (
            <Text style={styles.empty}>No GIFs found.</Text>
          ) : null}
          <Text style={styles.attribution}>Powered by GIPHY</Text>
        </BottomSheetScrollView>
      )}
    </AnimatedBottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  search: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  centered: {
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 14,
  },
  empty: {
    textAlign: "center",
    color: colors.muted,
    paddingVertical: 24,
    fontSize: 14,
  },
  attribution: {
    textAlign: "center",
    fontSize: 11,
    color: colors.muted,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
