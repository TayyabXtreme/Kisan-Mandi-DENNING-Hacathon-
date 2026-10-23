import { useState } from "react";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";

const KNOB = 26;
const TICKS = [-20, -10, 0, 10, 20];

/**
 * What-if price shift, −range…+range in whole percent (reference 12). Built on
 * the RN gesture responder system: this app has no GestureHandlerRootView.
 */
export function PercentSlider({
  value,
  onChange,
  range = 20,
}: {
  value: number;
  onChange: (value: number) => void;
  range?: number;
}) {
  const [width, setWidth] = useState(0);

  const setFromX = (x: number) => {
    if (width <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / width));
    const next = Math.round(ratio * 2 * range - range);
    if (next === value) return;
    onChange(next);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  };

  const pos = (v: number) => ((v + range) / (2 * range)) * width;
  const zero = pos(0);
  const knobX = pos(value);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Price change"
      accessibilityValue={{ min: -range, max: range, now: value, text: `${value > 0 ? "+" : ""}${value}%` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") onChange(Math.min(range, value + 1));
        if (e.nativeEvent.actionName === "decrement") onChange(Math.max(-range, value - 1));
      }}
    >
      <View
        style={styles.touch}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        // Gesture responder props (the system PanResponder wraps); rebuilt
        // each render, so they always see the current value.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
      >
        <View pointerEvents="none" style={styles.track} />
        {width > 0 && (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.fill,
                { left: Math.min(zero, knobX), width: Math.abs(knobX - zero) },
                value < 0 && { backgroundColor: theme.red },
              ]}
            />
            <View pointerEvents="none" style={[styles.zero, { left: zero - 1 }]} />
            <View
              pointerEvents="none"
              style={[
                styles.knob,
                { left: knobX - KNOB / 2 },
                value < 0 && { borderColor: theme.red },
              ]}
            />
          </>
        )}
      </View>
      <View style={styles.labels} pointerEvents="none">
        {TICKS.map((t) => (
          <Text key={t} style={styles.label}>
            {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${Math.abs(t)}%`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { height: 36, justifyContent: "center" },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.sand },
  fill: { position: "absolute", height: 8, top: 14, borderRadius: 4, backgroundColor: theme.green },
  zero: { position: "absolute", top: 9, width: 2, height: 18, borderRadius: 1, backgroundColor: theme.ink },
  knob: {
    position: "absolute",
    top: 5,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: theme.card,
    borderWidth: 4,
    borderColor: theme.green,
  },
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  label: { fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted },
});
