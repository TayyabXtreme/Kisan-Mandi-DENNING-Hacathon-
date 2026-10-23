import { Platform, StyleSheet, Text, View, Alert } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "../tap";
import { Sheet } from "../ui";

export type SheetAction = {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
};

/** Bottom-sheet list of actions (works on web, unlike Alert buttons). */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingBottom: 4 }}>
        {actions.map((a) => (
          <Tap
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={styles.row}
            pressedStyle={{ backgroundColor: theme.sand }}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          >
            <View style={[styles.icon, a.destructive && { backgroundColor: theme.redSoft }]}>
              <a.Icon size={19} color={a.destructive ? theme.red : theme.ink} strokeWidth={2} />
            </View>
            <Text style={[styles.label, a.destructive && { color: theme.red }]}>{a.label}</Text>
          </Tap>
        ))}
      </View>
    </Sheet>
  );
}

/** Yes/no confirm; window.confirm on web, where Alert buttons don't run. */
export function confirmAction(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: /delete|block|report/i.test(action) ? "destructive" : "default", onPress: onYes },
  ]);
}

/** Simple message popup (web-safe). */
export function notify(title: string, message: string) {
  if (Platform.OS === "web") globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 22, paddingVertical: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.sand,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: theme.ink },
});
