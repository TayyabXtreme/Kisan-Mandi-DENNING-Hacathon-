import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { AuthProvider, useAuthSession } from "@/providers/auth-provider";
import { theme } from "@/constants/theme";
import { fontAssets } from "@/constants/fonts";
import "../global.css";

// Keep the splash screen up until fonts load, so text never jumps fonts.
void SplashScreen.preventAutoHideAsync();

// The native root view shows through during screen transitions; keep it the
// app background instead of black.
void SystemUI.setBackgroundColorAsync(theme.bg);

// Creating the account or logging out swaps whole flows; fade, don't slide.
const authSwap = { animation: "fade" } as const;

function Navigation() {
  const { session, isPending } = useAuthSession();
  const signedIn = !!session?.user;
  if (isPending)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator
          color={theme.green}
          accessibilityLabel="Loading your account"
        />
      </View>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" options={authSwap} />
      {/* Registration/login when signed out; profile completion/editing when signed in. */}
      <Stack.Screen name="profile-setup" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" options={authSwap} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={authSwap} />
        <Stack.Screen name="crop/[cropId]" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="profit" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="expenses" />
        <Stack.Screen name="assistant" />
        <Stack.Screen name="connect-ai" />
        {/* Admin only: requests, markets, prices, messages (the API enforces it). */}
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin/market/[id]" />
        {/* Forms slide up as modals (references 06 and 11). */}
        <Stack.Screen name="alert-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="sell" options={{ presentation: "modal" }} />
        <Stack.Screen name="expense-form" options={{ presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || !!fontError; // on error, fall back to system font
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      {/* Keyboard-synced animations for every input (react-native-keyboard-controller). */}
      <KeyboardProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Navigation />
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
