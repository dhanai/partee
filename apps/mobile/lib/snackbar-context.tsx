import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal, StyleSheet, Text } from "react-native";
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";

const AUTO_DISMISS_MS = 2500;

type SnackbarContextValue = {
  show: (message: string) => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setKey((k) => k + 1);
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      {/* Native Modal so the toast sits above @gorhom/bottom-sheet (native modal layer). */}
      <Modal
        visible={message != null}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          /* dismiss handled by timer */
        }}
      >
        {message ? (
          <Reanimated.View
            key={key}
            entering={SlideInDown.duration(280).easing(Easing.out(Easing.ease))}
            exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.ease))}
            pointerEvents="none"
            style={styles.modalRoot}
          >
            <Reanimated.View
              entering={FadeIn.duration(200)}
              style={styles.chip}
              pointerEvents="none"
            >
              <Text style={styles.text}>{message}</Text>
            </Reanimated.View>
          </Reanimated.View>
        ) : null}
      </Modal>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used within SnackbarProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 100,
    alignItems: "center",
  },
  chip: {
    backgroundColor: "#2c2c2c",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
