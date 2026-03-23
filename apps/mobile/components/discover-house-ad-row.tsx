import * as Linking from "expo-linking";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { discoverHouseAdCopy, discoverHouseStoreUrl } from "../lib/discover-house-ad";
import { colors } from "../lib/theme";

/**
 * In-feed promo card (not AdMob). Same visual weight as native ad rows.
 */
export function DiscoverHouseAdRow() {
  const url = discoverHouseStoreUrl();
  const { title, subtitle, cta, imageUrl } = discoverHouseAdCopy();
  if (!url) return null;

  return (
    <View style={styles.outer}>
      <Text style={styles.badge}>Promo</Text>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => void Linking.openURL(url)}
        accessibilityRole="link"
        accessibilityLabel={`${title}. ${subtitle}`}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.media} contentFit="cover" />
        ) : null}
        <View style={styles.textBlock}>
          <Text style={styles.headline} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.body} numberOfLines={3}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.ctaPill}>
          <Text style={styles.ctaText} numberOfLines={1}>
            {cta}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 14,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.4,
    marginBottom: 6,
    marginLeft: 2,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.92,
  },
  media: {
    width: "100%",
    height: 160,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  textBlock: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  headline: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  ctaPill: {
    marginHorizontal: 14,
    marginVertical: 12,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.fairway,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
