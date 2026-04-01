import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { toAbsoluteUrl } from "../lib/api";

type Props = {
  images: string[];
  onPressImage: (index: number) => void;
};

export function PostImageCarousel({ images, onPressImage }: Props) {
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [singleAspectRatio, setSingleAspectRatio] = useState<number | null>(null);
  const resolvedContainerWidth = containerWidth > 0 ? containerWidth : Math.max(280, width - 48);
  const itemWidth = useMemo(
    () => Math.max(180, Math.round(resolvedContainerWidth * 0.6)),
    [resolvedContainerWidth],
  );
  const itemGap = 8;
  const normalized = useMemo(
    () => images.map((image) => toAbsoluteUrl(image)).filter((image) => image.length > 0),
    [images],
  );

  if (normalized.length === 0) return null;
  if (normalized.length === 1) {
    const singleUri = normalized[0]!;
    const singleWidth = resolvedContainerWidth;
    const singleHeight = singleAspectRatio ? singleWidth / singleAspectRatio : singleWidth;
    return (
      <Pressable onPress={() => onPressImage(0)} onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
        <Image
          source={singleUri}
          style={[styles.image, { width: singleWidth, height: singleHeight, marginRight: 0 }]}
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
    <View style={styles.wrap} onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      <FlatList
        data={normalized}
        horizontal
        keyExtractor={(item, index) => `${item}-${index}`}
        showsHorizontalScrollIndicator={false}
        decelerationRate="normal"
        contentContainerStyle={styles.scrollContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  scrollContent: {
    paddingLeft: 12,
    paddingRight: 12,
  },
  image: {
    borderRadius: 10,
    backgroundColor: "#e6efe8",
    marginRight: 8,
  },
});
