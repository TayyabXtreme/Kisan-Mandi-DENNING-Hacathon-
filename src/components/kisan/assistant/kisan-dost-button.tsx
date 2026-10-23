import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "../tap";

/** Opens the Kisan Dost assistant; `prompt` pre-sends a question. */
export function openKisanDost(prompt?: string) {
  router.push(prompt ? { pathname: "/assistant", params: { prompt } } : "/assistant");
}

/**
 * Floating green "Kisan Dost" button, bottom-right. `bottom` is the space to
 * keep free below it (e.g. TAB_BAR_SPACE on tab screens); safe area is added.
 */
export function KisanDostButton({
  bottom = 24,
  prompt,
  label = "Kisan Dost",
  style,
}: {
  bottom?: number;
  prompt?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottom + insets.bottom }, style]}>
      <Tap
        onPress={() => openKisanDost(prompt)}
        accessibilityRole="button"
        accessibilityLabel="Ask Kisan Dost, the farming assistant"
        style={styles.button}
      >
        <MessageCircle size={22} color={theme.card} strokeWidth={2.3} />
        <Text style={styles.text}>{label}</Text>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 18 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: theme.green,
    shadowColor: "#2B2118",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontFamily: fonts.bold, fontSize: 15, color: theme.card },
});
