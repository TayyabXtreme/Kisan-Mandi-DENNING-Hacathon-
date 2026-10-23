import { useState } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Extra style while pressed (default: slight fade). */
  pressedStyle?: StyleProp<ViewStyle>;
};

const DEFAULT_PRESSED: ViewStyle = { opacity: 0.85 };

/**
 * Pressable with pressed feedback. NativeWind's interop drops a Pressable
 * `style={({ pressed }) => …}` callback (layout and background vanish), so
 * always pass a plain array, as this does.
 */
export function Tap({ style, pressedStyle = DEFAULT_PRESSED, onPressIn, onPressOut, disabled, ...props }: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[style, pressed && !disabled && pressedStyle]}
    />
  );
}
