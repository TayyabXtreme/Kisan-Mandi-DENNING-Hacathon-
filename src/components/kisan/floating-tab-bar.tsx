import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Tabs } from "expo-router";
import { Bell, ChartLine, ClipboardList, MessageCircle, Store, UserRound, type LucideIcon } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "./tap";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; Icon: LucideIcon }> = {
  prices: { label: "Prices", Icon: ChartLine },
  marketplace: { label: "Market", Icon: Store },
  chats: { label: "Chats", Icon: MessageCircle },
  alerts: { label: "Alerts", Icon: Bell },
  listings: { label: "Listings", Icon: ClipboardList },
  profile: { label: "Profile", Icon: UserRound },
};

/** Height screens must leave free at the bottom of scroll content. */
export const TAB_BAR_SPACE = 112;

/**
 * Floating white pill tab bar (references 03, 05, 07, 10). With more than two
 * tabs only the active one shows its label. Alerts get a red triggered badge,
 * Chats a green unread badge. `hidden` routes stay navigable but get no tab
 * (farmers open Profile from the header avatar).
 */
export function FloatingTabBar({
  state,
  navigation,
  insets,
  alertCount,
  chatCount = 0,
  hidden = [],
}: TabBarProps & { alertCount: number; chatCount?: number; hidden?: string[] }) {
  const routes = state.routes.filter((r) => TABS[r.name] && !hidden.includes(r.name));
  const compact = routes.length > 2;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}
    >
      <View style={[styles.bar, !compact && styles.barNarrow]} accessibilityRole="tablist">
        {routes.map((route) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.key === route.key;
          const showLabel = focused || !compact;
          const isChats = route.name === "chats";
          const count = route.name === "alerts" ? alertCount : isChats ? chatCount : 0;
          const badge = count > 0 ? (count > 99 ? "99+" : count) : 0;
          const badgeColor = isChats && { backgroundColor: theme.green };
          return (
            <Tap
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${tab.label}${badge ? `, ${badge} ${isChats ? "unread" : "triggered"}` : ""}`}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[
                styles.tab,
                compact && !focused && styles.tabIconOnly,
                compact && focused && styles.tabCompactActive,
                focused && styles.tabActive,
              ]}
            >
              <View>
                <tab.Icon size={20} color={theme.ink} strokeWidth={focused ? 2.3 : 1.9} />
                {!!badge && (compact || !showLabel) && (
                  <View style={[styles.badgeDot, badgeColor]}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
              </View>
              {showLabel && (
                <Text style={styles.label} numberOfLines={1}>
                  {tab.label}
                </Text>
              )}
              {!!badge && showLabel && !compact && (
                <View style={[styles.badgeInline, badgeColor]}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.card,
    borderRadius: 34,
    padding: 6,
    marginHorizontal: 16,
    alignSelf: "stretch",
    shadowColor: theme.ink,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  barNarrow: { alignSelf: "center", gap: 6 },
  tab: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tabIconOnly: { width: 46, paddingHorizontal: 0 },
  // Active tab in the 4–5 tab bar: label only, badge stays on the icon, so
  // long labels (Listings, Alerts, Chats + badge) never overflow the pill.
  tabCompactActive: { paddingHorizontal: 14, flexShrink: 1 },
  tabActive: { backgroundColor: "#F1E9DC" },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: theme.ink },
  badgeDot: {
    position: "absolute",
    top: -7,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.card,
  },
  badgeInline: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: theme.red,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10.5, color: theme.card },
});
