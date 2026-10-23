import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { District, Role } from "../../convex/lib/kisan";

/**
 * "Tell us about you" answers, kept until /api/v1/users/me saves them. If the
 * app closes between creating the account and saving, index.tsx finishes it.
 */
export type ProfileDraft = {
  name: string;
  phone: string;
  email: string;
  district: District;
  role: Role;
};

const KEY = "kisanmandi.profileDraft";

export async function loadProfileDraft(): Promise<ProfileDraft | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(KEY)
        : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as ProfileDraft) : null;
  } catch {
    return null;
  }
}

export async function saveProfileDraft(draft: ProfileDraft) {
  try {
    const raw = JSON.stringify(draft);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // The profile screen shows again after sign-in if the draft is lost.
  }
}

export async function clearProfileDraft() {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {}
}
