import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  commitTournamentDetailsEditor,
  takeTournamentDetailsEditorSeed,
} from "../lib/tournament-details-editor-bridge";
import { applyWrap, insertSnippet, type TextSelection } from "../lib/tournament-markdown-insert";
import { colors } from "../lib/theme";

/** Match `group/[groupId]/post.tsx` — native multiline sizing. */
const INPUT_MIN_H = 120;
const INPUT_MAX_H = 280;
/** Extra space so caret clears the sticky toolbar above the keyboard (toolbar is busier than post). */
const STICKY_TOOLBAR_CONTENT_H = 56;
const MAX_LEN = 8000;

export default function TournamentDetailsEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<RNTextInput | null>(null);
  const [value, setValue] = useState("");
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const pendingSelectionRef = useRef<TextSelection | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://");

  useEffect(() => {
    setValue(takeTournamentDetailsEditorSeed());
  }, []);

  useEffect(() => {
    const p = pendingSelectionRef.current;
    if (!p || !inputRef.current) return;
    pendingSelectionRef.current = null;
    requestAnimationFrame(() => {
      inputRef.current?.setSelection(p.start, p.end);
    });
  }, [value]);

  const stickyOffset = useMemo(
    () => ({ opened: insets.bottom - 8 }),
    [insets.bottom],
  );

  const commit = useCallback((next: string, sel: TextSelection) => {
    pendingSelectionRef.current = sel;
    setValue(next);
  }, []);

  const onBold = useCallback(() => {
    const { next, selection: sel } = applyWrap(value, selection, "**", "**");
    commit(next, sel);
  }, [value, selection, commit]);

  const onItalic = useCallback(() => {
    const { next, selection: sel } = applyWrap(value, selection, "*", "*");
    commit(next, sel);
  }, [value, selection, commit]);

  const onUnderline = useCallback(() => {
    const { next, selection: sel } = applyWrap(value, selection, "++", "++");
    commit(next, sel);
  }, [value, selection, commit]);

  const openLinkModal = useCallback(() => {
    const { start, end } = selection;
    setLinkLabel(value.slice(start, end).trim() || "link");
    setLinkUrl("https://");
    setLinkOpen(true);
  }, [value, selection]);

  const confirmLink = useCallback(() => {
    const label = linkLabel.trim() || "link";
    const url = linkUrl.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setLinkOpen(false);
      return;
    }
    const snippet = `[${label}](${url})`;
    const { next, selection: sel } = insertSnippet(value, selection, snippet);
    commit(next, sel);
    setLinkOpen(false);
    Keyboard.dismiss();
  }, [value, selection, linkLabel, linkUrl, commit]);

  const handleDone = useCallback(() => {
    commitTournamentDetailsEditor(value.slice(0, MAX_LEN));
    Keyboard.dismiss();
    router.back();
  }, [value, router]);

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={STICKY_TOOLBAR_CONTENT_H + 12}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Tournament details</Text>
          <Text style={styles.charCount}>{value.length}/{MAX_LEN}</Text>
        </View>
        <Text style={styles.subtitle}>
          Use the toolbar for bold, italic, underline, and links. Swipe down to close without saving.
        </Text>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={(t) => setValue(t.slice(0, MAX_LEN))}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          placeholder="Prizes, format, rules, dress code…"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled
          maxLength={MAX_LEN}
          textAlignVertical="top"
        />
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={stickyOffset}>
        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.toolBtn} onPress={onBold} accessibilityLabel="Bold" hitSlop={6}>
            <Text style={styles.toolIcon}>B</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={onItalic} accessibilityLabel="Italic" hitSlop={6}>
            <Text style={[styles.toolIcon, styles.toolItalic]}>I</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={onUnderline} accessibilityLabel="Underline" hitSlop={6}>
            <Text style={[styles.toolIcon, styles.toolUnderline]}>U</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={openLinkModal} accessibilityLabel="Insert link" hitSlop={6}>
            <Ionicons name="link-outline" size={22} color={colors.fairway} />
          </Pressable>
          <View style={styles.toolbarSpacer} />
          <Pressable style={styles.done} onPress={handleDone} accessibilityLabel="Save details">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardStickyView>

      <Modal visible={linkOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setLinkOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add link</Text>
            <Text style={styles.modalLabel}>Label</Text>
            <TextInput
              style={styles.modalInput}
              value={linkLabel}
              onChangeText={setLinkLabel}
              placeholder="Text to show"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.modalLabel}>URL</Text>
            <TextInput
              style={styles.modalInput}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setLinkOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveWrap} onPress={confirmLink}>
                <Text style={styles.modalSave}>Insert</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
    minHeight: INPUT_MIN_H,
    maxHeight: INPUT_MAX_H,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  toolBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolIcon: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.fairway,
  },
  toolItalic: { fontStyle: "italic", fontWeight: "700" },
  toolUnderline: { textDecorationLine: "underline" },
  toolbarSpacer: {
    flex: 1,
    minWidth: 8,
  },
  charCount: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  done: {
    flexShrink: 0,
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 4 },
  modalLabel: { fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase" },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 8,
    alignItems: "center",
  },
  modalCancel: { fontSize: 16, color: colors.muted, fontWeight: "600" },
  modalSaveWrap: {
    backgroundColor: colors.fairway,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSave: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
