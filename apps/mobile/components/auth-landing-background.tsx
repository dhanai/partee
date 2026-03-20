import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { colors } from "../lib/theme";

const HERO_IMAGE = require("./gen_1774034667397.png");

/** Match theme authLandingBackground #0f2418 */
const OVERLAY_RGB = "15, 36, 24";
const OVERLAY_TOP_ALPHA = 0.14;
const OVERLAY_BOTTOM_ALPHA = 0.82;
const BAND_COUNT = 40;

/** t = 0 top … 1 bottom; curve adds a bit more dim in the lower third */
function overlayAlphaAt(t: number): number {
  const curved = Math.pow(Math.max(0, Math.min(1, t)), 1.18);
  return OVERLAY_TOP_ALPHA + (OVERLAY_BOTTOM_ALPHA - OVERLAY_TOP_ALPHA) * curved;
}

function WebDimOverlay() {
  const stops = [0, 0.22, 0.45, 0.68, 0.88, 1].map((pos) => {
    const a = overlayAlphaAt(pos);
    return `rgba(${OVERLAY_RGB},${a.toFixed(3)}) ${(pos * 100).toFixed(2)}%`;
  });
  const backgroundImage = `linear-gradient(180deg, ${stops.join(", ")})`;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundImage } as object]}
    />
  );
}

function NativeDimOverlay() {
  return (
    <View style={[StyleSheet.absoluteFillObject, styles.column]} pointerEvents="none">
      {Array.from({ length: BAND_COUNT }, (_, i) => {
        const t = (i + 0.5) / BAND_COUNT;
        const a = overlayAlphaAt(t);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: `rgba(${OVERLAY_RGB}, ${a})`,
            }}
          />
        );
      })}
    </View>
  );
}

export function AuthLandingBackground({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      <Image
        source={HERO_IMAGE}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        contentPosition="top"
        pointerEvents="none"
      />
      {Platform.OS === "web" ? <WebDimOverlay /> : <NativeDimOverlay />}
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.authLandingBackground,
  },
  column: {
    flexDirection: "column",
  },
  content: {
    flex: 1,
  },
});
