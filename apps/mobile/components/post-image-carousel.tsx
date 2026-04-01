import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

type Props = {
  images: string[];
  onPressImage: (index: number) => void;
};

export function PostImageCarousel({ images, onPressImage }: Props) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const itemWidth = useMemo(() => Math.max(220, width - 56), [width]);
  const [singleAspectRatio, setSingleAspectRatio] = useState<number | null>(null);
  const normalized = useMemo(
    () => images.map((image) => toAbsoluteUrl(image)).filter((image) => image.length > 0),
    [images],
  );

  if (normalized.length === 0) return null;
  if (normalized.length === 1) {
    const singleUri = normalized[0]!;
    const singleHeight = singleAspectRatio ? itemWidth / singleAspectRatio : itemWidth;
    return (
      <Pressable onPress={() => onPressImage(0)}>
        <Image
          source={singleUri}
          style={[styles.image, { width: itemWidth, height: singleHeight, marginRight: 0 }]}
          contentFit="cover"
          transition={0}
          onLoad={(event) => {
            const source = (event as { source?: { width?: number; height?: number } }).source;
            const w = source?.width ?? 0;
            const h = source?.height ?? 0;
            if (w > 0 && h > 0) setSingleAspectRatio(w / h);
          }}
        />
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={normalized}
        horizontal
        pagingEnabled
        keyExtractor={(item, index) => `${item}-${index}`}
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / itemWidth);
          setActiveIndex(Math.max(0, Math.min(normalized.length - 1, index)));
        }}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => onPressImage(index)}>
            <Image
              source={item}
              style={[styles.image, { width: itemWidth, height: (itemWidth * 5) / 4 }]}
              contentFit="cover"
              transition={0}
            />
          </Pressable>
        )}
      />
      {normalized.length > 1 ? (
        <View style={styles.dotsRow}>
          {normalized.map((_, index) => (
            <View key={`dot-${index}`} style={[styles.dot, activeIndex === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  image: {
    height: 220,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
    marginRight: 8,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#d6d2cb",
  },
  dotActive: {
    backgroundColor: colors.text,
    width: 7,
    height: 7,
  },
});
