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
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { toAbsoluteUrl } from "./api";
import { colors } from "./theme";

export type GroupChatToastPayload = {
  inviteToken: string;
  roundTitle: string;
  senderName: string;
  senderAvatar?: string;
  bodyPreview: string;
};

export type RsvpToastPayload = {
  inviteToken: string;
  roundTitle: string;
  guestName: string;
  guestAvatar?: string;
  spotStatus: "confirmed" | "requested" | "declined";
};

type ToastItem =
  | { type: "group-chat"; payload: GroupChatToastPayload }
  | { type: "rsvp"; payload: RsvpToastPayload };

type InAppToastContextValue = {
  showGroupChatToast: (payload: GroupChatToastPayload) => void;
  showRsvpToast: (payload: RsvpToastPayload) => void;
};

const InAppToastContext = createContext<InAppToastContextValue | null>(null);

function isViewingRoundChatPath(path: string, inviteToken: string): boolean {
  const t = inviteToken.trim();
  if (!t) return false;
  const n = path.replace(/\/+/g, "/");
  return n.includes(`/round/${t}/chat`);
}

function isViewingRoundDetailPath(path: string, inviteToken: string): boolean {
  const t = inviteToken.trim();
  if (!t) return false;
  const n = path.replace(/\/+/g, "/");
  return n === `/round/${t}` || n.startsWith(`/round/${t}/`);
}

function rsvpBodyText(status: RsvpToastPayload["spotStatus"]): string {
  if (status === "confirmed") return "Claimed a spot on your round.";
  if (status === "requested") return "Requested to join your round.";
  return "Declined your invite.";
}

const TOAST_AUTO_HIDE_MS = 5200;

export function InAppToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [toast, setToast] = useState<ToastItem | null>(null);
  const toastRef = useRef<ToastItem | null>(null);
  toastRef.current = toast;
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
      if (finished) setToast(null);
    });
  }, [clearTimer, translateY]);

  const showToast = useCallback(
    (item: ToastItem) => {
      clearTimer();
      translateY.setValue(-160);
      setToast(item);
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

  const showGroupChatToast = useCallback(
    (p: GroupChatToastPayload) => {
      if (isViewingRoundChatPath(pathnameRef.current, p.inviteToken)) return;
      showToast({ type: "group-chat", payload: p });
    },
    [showToast],
  );

  const showRsvpToast = useCallback(
    (p: RsvpToastPayload) => {
      if (isViewingRoundDetailPath(pathnameRef.current, p.inviteToken)) return;
      showToast({ type: "rsvp", payload: p });
    },
    [showToast],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handlePress = useCallback(() => {
    const t = toastRef.current;
    if (!t) return;
    if (t.type === "group-chat") {
      router.push({
        pathname: "/round/[token]/chat",
        params: { token: t.payload.inviteToken },
      });
    } else if (t.type === "rsvp") {
      router.push({
        pathname: "/round/[token]",
        params: { token: t.payload.inviteToken },
      });
    }
    hide();
  }, [hide, router]);

  const value = useMemo(
    () => ({ showGroupChatToast, showRsvpToast }),
    [showGroupChatToast, showRsvpToast],
  );

  let kicker = "";
  let avatarUrl: string | undefined;
  let title = "";
  let body = "";
  if (toast?.type === "group-chat") {
    const p = toast.payload;
    kicker = `Group chat · ${p.roundTitle}`;
    avatarUrl = p.senderAvatar;
    title = p.senderName;
    body = p.bodyPreview;
  } else if (toast?.type === "rsvp") {
    const p = toast.payload;
    kicker = p.roundTitle;
    avatarUrl = p.guestAvatar;
    title = p.guestName;
    body = rsvpBodyText(p.spotStatus);
  }

  return (
    <InAppToastContext.Provider value={value}>
      {children}
      {toast ? (
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
            onPress={handlePress}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Open: ${title}`}
          >
            <Text style={styles.kicker}>{kicker}</Text>
            <View style={styles.row}>
              {avatarUrl ? (
                <Image
                  source={{ uri: toAbsoluteUrl(avatarUrl) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={16} color={colors.muted} />
                </View>
              )}
              <View style={styles.textCol}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.body} numberOfLines={2}>
                  {body}
                </Text>
              </View>
            </View>
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
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  textCol: {
    flex: 1,
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
