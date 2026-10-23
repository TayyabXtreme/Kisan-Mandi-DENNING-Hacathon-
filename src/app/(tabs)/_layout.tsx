import { ActivityIndicator, Dimensions, Easing, View } from "react-native";
import type { BottomTabNavigationOptions } from "expo-router/tabs";
import { Redirect, Tabs } from "expo-router";
import { useUnreadChats } from "@/components/kisan/chat/chat-api";
import { FloatingTabBar } from "@/components/kisan/floating-tab-bar";
import { StateView } from "@/components/kisan/ui";
import { theme } from "@/constants/theme";
import { useAlerts, useMe } from "@/lib/api/resources";

/**
 * Pager-style tab swap: the old tab slides out as the new one slides in.
 * progress is -1 left of the active tab, 0 active, 1 right of it. Kept at
 * module level (no component closure) and reads the width on each call, so
 * rotation and the React Compiler can't leave it with a stale or missing value.
 */
const slideScene: BottomTabNavigationOptions["sceneStyleInterpolator"] = ({ current }) => {
  const width = Dimensions.get("window").width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  };
};

const SLIDE_SPEC: BottomTabNavigationOptions["transitionSpec"] = {
  animation: "timing",
  config: { duration: 280, easing: Easing.out(Easing.cubic) },
};

/**
 * Role-based tabs (docs/plan.md §5). Farmers: Prices · Market · Chats · Alerts ·
 * Listings, with Profile opened from the header avatar. Buyers: Prices ·
 * Market · Chats · Profile. The API enforces the farmer-only rule (403).
 */
export default function TabsLayout() {
  const me = useMe();
  const isFarmer = me.data?.role === "farmer";
  // The badge re-evaluates alerts whenever this resource refreshes.
  const alerts = useAlerts(isFarmer);
  // Live unread count (reactive Convex query, like the chat screens).
  const chatCount = useUnreadChats();

  if (!me.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center" }}>
        {me.error ? (
          <StateView error={me.error} onRetry={() => void me.refresh()} />
        ) : (
          <ActivityIndicator color={theme.green} accessibilityLabel="Loading" />
        )}
      </View>
    );
  }
  if (!me.data.role) return <Redirect href="/profile-setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.bg },
        // Mount every tab up front so a slide never reveals a loading screen.
        lazy: false,
        transitionSpec: SLIDE_SPEC,
        sceneStyleInterpolator: slideScene,
      }}
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          alertCount={alerts.data?.triggeredCount ?? 0}
          chatCount={chatCount}
          hidden={isFarmer ? ["profile"] : []}
        />
      )}
    >
      <Tabs.Screen name="prices" />
      <Tabs.Screen name="marketplace" />
      <Tabs.Screen name="chats" />
      <Tabs.Protected guard={isFarmer}>
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="listings" />
      </Tabs.Protected>
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
