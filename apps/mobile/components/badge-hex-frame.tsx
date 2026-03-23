import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Polygon, Svg } from "react-native-svg";

const VB_W = 100;
const VB_H = 115;
/** Flat-top hex (NYT-style patch silhouette). */
const HEX_POINTS = "50 4 95 30 95 85 50 111 5 85 5 30";

export function badgeHexHeight(width: number): number {
  return (width * VB_H) / VB_W;
}

type Props = {
  width: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  children?: ReactNode;
};

/**
 * Vector hex medallion with centered slot for an icon (NYT Games–style patch shape).
 */
export function BadgeHexFrame({
  width,
  fill,
  stroke,
  strokeWidth = 2.75,
  children,
}: Props) {
  const h = badgeHexHeight(width);
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Polygon
          points={HEX_POINTS}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, styles.iconSlot]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
});
