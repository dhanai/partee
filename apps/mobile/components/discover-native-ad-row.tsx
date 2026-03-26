import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from "react-native-google-mobile-ads";
import { discoverNativeAdUnitId, isAdsDisabled, NON_PERSONALIZED, waitForAdsInit } from "../lib/parfade-admob";
import { colors } from "../lib/theme";

function useAdsOff(): boolean {
  return isAdsDisabled();
}

/**
 * One scrollable native ad row for Discover. Loads on mount; destroys on unmount.
 */
export function DiscoverNativeAdRow() {
  const off = useAdsOff();
  const [ad, setAd] = useState<NativeAd | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (off) return;
    let cancelled = false;
    let loaded: NativeAd | null = null;
    const unitId = discoverNativeAdUnitId();
    if (!unitId) {
      setFailed(true);
      return;
    }
    void (async () => {
      try {
        await waitForAdsInit();
        if (cancelled) return;
        const native = await NativeAd.createForAdRequest(unitId, NON_PERSONALIZED);
        if (cancelled) {
          native.destroy();
          return;
        }
        loaded = native;
        setAd(native);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [off]);

  if (off || failed) return null;

  if (!ad) {
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading ad">
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <Text style={styles.adBadge}>Ad</Text>
      <NativeAdView nativeAd={ad} style={styles.card}>
        <View style={styles.textBlock}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2} />
          </NativeAsset>
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={3} />
          </NativeAsset>
        </View>
        <NativeMediaView style={styles.media} resizeMode="cover" />
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={styles.ctaText} numberOfLines={1} />
        </NativeAsset>
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 14,
  },
  adBadge: {
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
  textBlock: {
    paddingHorizontal: 14,
    paddingTop: 12,
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
  media: {
    width: "100%",
    height: 160,
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  ctaText: {
    marginHorizontal: 14,
    marginVertical: 12,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.fairway,
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  skeleton: {
    minHeight: 120,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
});
