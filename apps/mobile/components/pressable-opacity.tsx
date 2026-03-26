import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";

type Props = PressableProps & {
  activeOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Drop-in Pressable that dims on press (like TouchableOpacity)
 * but with the full Pressable API.
 */
export function PressableOpacity({
  activeOpacity = 0.7,
  style,
  ...rest
}: Props) {
  return (
    <Pressable
      {...rest}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        state.pressed && { opacity: activeOpacity },
      ]}
    />
  );
}
