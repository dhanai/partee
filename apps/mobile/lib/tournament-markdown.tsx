import type { ReactNode } from "react";
import { Linking, StyleSheet, Text, View, type TextStyle } from "react-native";
import { colors } from "./theme";

/**
 * Lightweight inline markdown for tournament copy:
 * - **bold**
 * - *italic*
 * - ++underline++
 * - [label](https://url)
 *
 * Paragraphs: blank line or single newline.
 */
export function TournamentMarkdownBody({
  source,
  baseStyle,
}: {
  source: string;
  baseStyle?: TextStyle;
}) {
  const trimmed = source.trim();
  if (!trimmed) return null;
  const blocks = trimmed.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={styles.blockWrap}>
      {blocks.map((block, bi) => (
        <Text key={bi} style={[styles.paragraph, baseStyle]}>
          {parseInline(block, `p${bi}`)}
        </Text>
      ))}
    </View>
  );
}

function parseInline(text: string, keyBase: string): ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const mLink = rest.match(/^\[([^\]]*)\]\(([^)]*)\)/);
    if (mLink) {
      const label = mLink[1] ?? "";
      const url = (mLink[2] ?? "").trim();
      out.push(
        <Text
          key={`${keyBase}-l${k++}`}
          onPress={() => {
            if (url) void Linking.openURL(url);
          }}
          style={styles.link}
        >
          {label || url || "link"}
        </Text>,
      );
      i += mLink[0].length;
      continue;
    }
    const mBold = rest.match(/^\*\*([\s\S]*?)\*\*/);
    if (mBold) {
      out.push(
        <Text key={`${keyBase}-b${k++}`} style={styles.bold}>
          {mBold[1]}
        </Text>,
      );
      i += mBold[0].length;
      continue;
    }
    const mUnder = rest.match(/^\+\+([\s\S]*?)\+\+/);
    if (mUnder) {
      out.push(
        <Text key={`${keyBase}-u${k++}`} style={styles.underline}>
          {mUnder[1]}
        </Text>,
      );
      i += mUnder[0].length;
      continue;
    }
    const mItal = rest.match(/^\*([\s\S]*?)\*/);
    if (mItal) {
      out.push(
        <Text key={`${keyBase}-i${k++}`} style={styles.italic}>
          {mItal[1]}
        </Text>,
      );
      i += mItal[0].length;
      continue;
    }
    out.push(text[i]);
    i += 1;
  }
  return out;
}

const styles = StyleSheet.create({
  blockWrap: { gap: 10 },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  underline: { textDecorationLine: "underline" },
  link: {
    color: colors.fairway,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
