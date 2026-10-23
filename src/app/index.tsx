import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect, type Href } from "expo-router";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { clearProfileDraft, loadProfileDraft } from "@/lib/profile-draft";
import { hasSeenWelcome } from "@/lib/welcome-seen";
import { useAuthSession } from "@/providers/auth-provider";

/**
 * Entry router.
 * Signed out: Welcome on first launch, then registration/login. Signed in:
 * retries a profile save that didn't finish, asks for the profile if it's
 * still missing, otherwise opens the app.
 */
/** Where this launch should go. Throws when the profile can't be loaded. */
async function destination(signedIn: boolean): Promise<Href> {
  if (!signedIn) return (await hasSeenWelcome()) ? "/profile-setup" : "/welcome";
  let me = await api.get<Me>("/users/me");
  if (!me.role) {
    const draft = await loadProfileDraft();
    if (draft) {
      me = await api.patch<Me>("/users/me", draft);
      await clearProfileDraft();
    }
  }
  return me.role ? "/prices" : "/profile-setup";
}

export default function Index() {
  const { session } = useAuthSession();
  const signedIn = !!session?.user;
  const [attempt, setAttempt] = useState(0);
  // Keyed by sign-in state and attempt, so a stale answer is never used.
  const key = `${signedIn}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    target: Href | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    destination(signedIn).then(
      (target) => alive && setResult({ key, target }),
      () => alive && setResult({ key, target: null }),
    );
    return () => {
      alive = false;
    };
  }, [signedIn, key]);

  const current = result?.key === key ? result : null;
  const target = current?.target ?? null;
  const failed = !!current && !current.target;

  if (target) return <Redirect href={target} />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
      }}
    >
      {failed ? (
        <>
          <Text
            style={{ fontFamily: fonts.medium, fontSize: 15, color: theme.ink, textAlign: "center" }}
          >
            Couldn&apos;t load your profile. Check your internet and try again.
          </Text>
          <Pressable
            onPress={() => setAttempt((n) => n + 1)}
            accessibilityRole="button"
            style={{
              backgroundColor: theme.ink,
              borderRadius: 24,
              paddingHorizontal: 28,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, color: theme.card }}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={theme.green} accessibilityLabel="Loading" />
      )}
    </View>
  );
}
