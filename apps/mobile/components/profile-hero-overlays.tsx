import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

const CREAM = colors.background;

type Props = {
  /** Initials / soft green hero — keep center light for large initials */
  placeholder?: boolean;
};

/**
 * Full-bleed gradients: top legibility for status/header, smooth vignette + fade into cream at bottom.
 */
export function ProfileHeroOverlays({ placeholder = false }: Props) {
  if (placeholder) {
    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.06)", "transparent"]}
          locations={[0, 0.5, 1]}
          style={styles.topBand}
        />
        <LinearGradient
          colors={[
            "transparent",
            "rgba(0,0,0,0.06)",
            "rgba(0,0,0,0.28)",
            "rgba(250,248,245,0.35)",
            "rgba(250,248,245,0.88)",
            CREAM,
          ]}
          locations={[0, 0.42, 0.64, 0.8, 0.93, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.12)", "transparent"]}
        locations={[0, 0.42, 1]}
        style={styles.topBand}
      />
      <LinearGradient
        colors={[
          "transparent",
          "rgba(0,0,0,0.06)",
          "rgba(0,0,0,0.38)",
          "rgba(0,0,0,0.58)",
          "rgba(250,248,245,0.22)",
          "rgba(250,248,245,0.72)",
          "rgba(250,248,245,0.97)",
          CREAM,
        ]}
        locations={[0, 0.26, 0.48, 0.64, 0.76, 0.86, 0.95, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
});
