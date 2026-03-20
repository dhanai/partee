import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const SHELL_BG = "#dfe6df";

type RoundCoverImageProps = {
  uri: string;
  /**
   * Stable per logical image (e.g. `${roundId}:${imagePath}`) for list recycling and cache coherence.
   */
  recyclingKey: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Cross-dissolve when the bitmap appears or when the source changes. SVGs skip (decode is unreliable).
   * @default 240
   */
  transitionMs?: number;
};

/**
 * Course / round hero imagery: disk+memory cache (matches list → detail), cross-dissolve instead of a hard pop.
 */
export function RoundCoverImage({
  uri,
  recyclingKey,
  style,
  transitionMs = 240,
}: RoundCoverImageProps) {
  const isSvg = /\.svg(\?|$)/i.test(uri);
  return (
    <View style={[style, styles.shell]}>
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        transition={isSvg ? null : transitionMs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    backgroundColor: SHELL_BG,
  },
});
