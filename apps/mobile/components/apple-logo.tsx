import Svg, { Path } from "react-native-svg";

type Props = { size?: number; color?: string };

export function AppleLogo({ size = 20, color = "#000" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.64-2.2.46-3.06-.4C3.79 16.17 4.36 9.53 8.77 9.28c1.25.07 2.13.72 2.87.76.97-.2 1.9-.77 2.94-.7 1.24.1 2.18.57 2.8 1.46-2.56 1.54-1.95 4.92.57 5.86-.47 1.24-.97 2.47-1.9 3.62zM12.03 9.2C11.88 7.16 13.5 5.5 15.41 5.35c.27 2.34-2.12 4.09-3.38 3.85z"
        fill={color}
      />
    </Svg>
  );
}
