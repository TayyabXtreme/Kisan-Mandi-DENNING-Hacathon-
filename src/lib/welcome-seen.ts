import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// After the first Get Started, signed-out launches open Login directly.
const KEY = "kisanmandi.welcomeSeen";

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) === "1";
    return (await SecureStore.getItemAsync(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, "1");
    else await SecureStore.setItemAsync(KEY, "1");
  } catch {
    // Not critical: the welcome screen simply shows again next time.
  }
}
