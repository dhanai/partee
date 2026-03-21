import { usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

export type GroupChatToastPayload = {
  inviteToken: string;
  roundTitle: string;
  senderName: string;
  bodyPreview: string;
};

type InAppToastContextValue = {
  showGroupChatToast: (payload: GroupChatToastPayload) => void;
};

const InAppToastContext = createContext<InAppToastContextValue | null>(null);

function isViewingRoundChatPath(path: string, inviteToken: string): boolean {
  const t = inviteToken.trim();
  if (!t) return false;
  const n = path.replace(/\/+/g, "/");
  return n.includes(`/round/${t}/chat`);
}

const TOAST_AUTO_HIDE_MS = 5200;

export function InAppToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [payload, setPayload] = useState<GroupChatToastPayload | null>(null);
  const payloadRef = useRef<GroupChatToastPayload | null>(null);
  payloadRef.current = payload;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;

  const clearTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    Animated.timing(translateY, {
      toValue: -200,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPayload(null);
    });
  }, [clearTimer, translateY]);

  const showGroupChatToast = useCallback(
    (p: GroupChatToastPayload) => {
      if (isViewingRoundChatPath(pathnameRef.current, p.inviteToken)) return;

      clearTimer();
      translateY.setValue(-160);
      setPayload(p);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 65,
      }).start();

      hideTimerRef.current = setTimeout(() => {
        hide();
      }, TOAST_AUTO_HIDE_MS);
    },
    [clearTimer, hide, translateY],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const openChat = useCallback(() => {
    const p = payloadRef.current;
    if (!p) return;
    const token = p.inviteToken;
    router.push({
      pathname: "/round/[token]/chat",
      params: { token },
    });
    hide();
  }, [hide, router]);

  const value = useMemo(() => ({ showGroupChatToast }), [showGroupChatToast]);

  return (
    <InAppToastContext.Provider value={value}>
      {children}
      {payload ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.anchor,
            {
              paddingTop: insets.top + 10,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable
            onPress={openChat}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Open group chat: ${payload.roundTitle}`}
          >
            <Text style={styles.kicker}>Group chat · {payload.roundTitle}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {payload.senderName}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {payload.bodyPreview}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </InAppToastContext.Provider>
  );
}

export function useInAppToast(): InAppToastContextValue {
  const ctx = useContext(InAppToastContext);
  if (!ctx) {
    throw new Error("useInAppToast must be used within InAppToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 50_000,
    alignItems: "center",
    paddingHorizontal: 14,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  cardPressed: { opacity: 0.92 },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
    lineHeight: 20,
  },
});
