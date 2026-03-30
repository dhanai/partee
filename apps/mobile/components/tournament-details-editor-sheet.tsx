import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "./animated-bottom-sheet-frame";
import { applyWrap, insertSnippet, type TextSelection } from "../lib/tournament-markdown-insert";
import { colors } from "../lib/theme";

const SNAP = ["82%"] as const;
const MAX_LEN = 8000;

type Props = {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (next: string) => void;
};

export function TournamentDetailsEditorSheet({ visible, onClose, value, onChange }: Props) {
  const inputRef = useRef<ComponentRef<typeof BottomSheetTextInput> | null>(null);
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const pendingSelectionRef = useRef<TextSelection | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://");

  useEffect(() => {
    const p = pendingSelectionRef.current;
    if (!p || !inputRef.current) return;
    pendingSelectionRef.current = null;
    requestAnimationFrame(() => {
      inputRef.current?.setSelection(p.start, p.end);
    });
  }, [value]);

  const commit = useCallback(
    (next: string, sel: TextSelection) => {
      pendingSelectionRef.current = sel;
      onChange(next);
    },
    [onChange],
  );

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

  return (
    <>
      <AnimatedBottomSheetFrame
        visible={visible}
        onClose={onClose}
        snapPoints={SNAP}
        keyboardBlurBehavior="restore"
        enableContentPanningGesture={false}
        backdropAccessibilityLabel="Dismiss tournament details"
      >
        <BottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetTitle}>Tournament details</Text>
          <Text style={styles.sheetHint}>
            Format with the toolbar: bold, italic, underline, and links.
          </Text>

          <View style={styles.toolbar}>
            <Pressable
              style={styles.toolBtn}
              onPress={onBold}
              accessibilityLabel="Bold"
              hitSlop={6}
            >
              <Text style={styles.toolIcon}>B</Text>
            </Pressable>
            <Pressable
              style={styles.toolBtn}
              onPress={onItalic}
              accessibilityLabel="Italic"
              hitSlop={6}
            >
              <Text style={[styles.toolIcon, styles.toolItalic]}>I</Text>
            </Pressable>
            <Pressable
              style={styles.toolBtn}
              onPress={onUnderline}
              accessibilityLabel="Underline"
              hitSlop={6}
            >
              <Text style={[styles.toolIcon, styles.toolUnderline]}>U</Text>
            </Pressable>
            <Pressable
              style={styles.toolBtn}
              onPress={openLinkModal}
              accessibilityLabel="Insert link"
              hitSlop={6}
            >
              <Ionicons name="link-outline" size={22} color={colors.fairway} />
            </Pressable>
            <View style={styles.toolbarSpacer} />
            <Text style={styles.charCount}>
              {value.length}/{MAX_LEN}
            </Text>
          </View>

          <BottomSheetTextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={(t) => onChange(t.slice(0, MAX_LEN))}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder="Prizes, format, rules, dress code…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={MAX_LEN}
            textAlignVertical="top"
          />

          <Pressable style={styles.doneBtn} onPress={() => { Keyboard.dismiss(); onClose(); }}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </BottomSheetScrollView>
      </AnimatedBottomSheetFrame>

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
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: "100%" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  sheetHint: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  toolIcon: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.fairway,
  },
  toolItalic: { fontStyle: "italic", fontWeight: "700" },
  toolUnderline: { textDecorationLine: "underline" },
  toolbarSpacer: { flex: 1 },
  charCount: { fontSize: 12, color: colors.muted },
  input: {
    minHeight: 220,
    maxHeight: 360,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
  },
  doneBtn: {
    marginTop: 14,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.fairway,
  },
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
