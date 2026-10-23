import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
  useMutation,
} from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { authClient, authConfigured } from "@/lib/auth-client";
import { CONVEX_URL } from "@/lib/config";
import { clearProfileDraft } from "@/lib/profile-draft";
import { flushApiSessionChange, setApiSession } from "@/lib/api/token-cache";
import { api } from "../../convex/_generated/api";

type Session = typeof authClient.$Infer.Session;
const AuthContext = createContext<{
  session: Session | null;
  isPending: boolean;
  /** Signs out at once in the app; the server is told in the background. */
  signOut: () => void;
}>({
  session: null,
  isPending: false,
  signOut: () => {},
});

const convex = authConfigured
  ? new ConvexReactClient(CONVEX_URL, {
      expectAuth: true,
      unsavedChangesWarning: false,
    })
  : null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Convex gives up silently when a token fetch returns null, and only asks
// again when the fetcher changes. Retry transient failures here instead.
export async function fetchConvexToken(): Promise<string | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { data, error } = await authClient.convex.token({
        fetchOptions: { throw: false },
      });
      if (data?.token) return data.token;
      if (error?.status === 401) return null; // No valid session: don't retry.
      console.warn(`Auth: Convex token attempt ${attempt} failed.`, error?.status, error?.message);
    } catch (e) {
      console.warn(`Auth: Convex token attempt ${attempt} failed.`, e);
    }
    await wait(500 * attempt);
  }
  return null;
}

// Web Google sign-in returns with ?ott=…; exchange it for a session.
function useCrossDomainOneTimeToken() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("ott");
    if (!token) return;
    url.searchParams.delete("ott");
    window.history.replaceState({}, "", url);
    const client = authClient as unknown as {
      crossDomain: {
        oneTimeToken: {
          verify: (args: { token: string }) => Promise<{
            data?: { session?: { token: string } } | null;
          }>;
        };
      };
      updateSession: () => void;
    };
    void (async () => {
      const result = await client.crossDomain.oneTimeToken.verify({ token });
      const session = result.data?.session;
      if (!session) return;
      await authClient.getSession({
        fetchOptions: { headers: { Authorization: `Bearer ${session.token}` } },
      });
      client.updateSession();
    })();
  }, []);
}

/**
 * Better Auth can say "signed in" (on native it restores a cached session at
 * launch) while Convex is not. If that lasts, retry the Convex login, and sign
 * out when the server no longer has the session.
 */
function ConvexAuthWatchdog({
  sessionId,
  onRetry,
}: {
  sessionId?: string;
  onRetry: () => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const retries = useRef(0);
  const ensureUser = useMutation(api.users.ensure);

  // Make sure the app `users` row exists for every login (Google included).
  useEffect(() => {
    if (sessionId && isAuthenticated)
      ensureUser().catch((e) => console.warn("Auth: couldn't sync profile.", e));
  }, [sessionId, isAuthenticated, ensureUser]);

  useEffect(() => {
    if (isAuthenticated) retries.current = 0;
    if (!sessionId || isLoading || isAuthenticated) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await authClient.convex.token({
        fetchOptions: { throw: false },
      });
      if (cancelled) return;
      if (error?.status === 401) {
        console.warn("Auth: the saved session has expired. Signing out.");
        await authClient.signOut();
      } else if (data?.token && retries.current < 3) {
        retries.current += 1;
        onRetry();
      } else {
        console.warn(
          "Auth: Convex did not accept the login.",
          error?.status ?? "token issued",
          error?.message ?? "",
        );
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, isLoading, isAuthenticated, onRetry]);

  return null;
}

function ConvexAuthBridge({
  client,
  children,
}: PropsWithChildren<{ client: ConvexReactClient }>) {
  const { data: authSession, isPending: sessionPending } = authClient.useSession();
  // The session the user just logged out of. Hidden right away, so logout
  // doesn't wait for the server round trip and the session refetch.
  const [signedOutId, setSignedOutId] = useState<string | null>(null);
  const session = authSession && authSession.session.id !== signedOutId ? authSession : null;
  const signOut = useCallback(() => {
    if (!authSession) return;
    setSignedOutId(authSession.session.id);
    // The Expo client wipes the stored session before sending this request,
    // so the device stays signed out even if the network call fails.
    void clearProfileDraft()
      .then(() => authClient.signOut())
      .catch((e) => console.warn("Auth: background sign-out failed.", e));
  }, [authSession]);
  // Better Auth flips isPending back to true on every background refetch while
  // signed out (after logout, sign-in attempts, app focus…). Treat only the
  // first load as loading, or the whole navigator unmounts and flashes.
  const [settled, setSettled] = useState(false);
  if (!sessionPending && !settled) setSettled(true);
  const isPending = !settled;
  const sessionId = session?.session.id;
  // A new or ended session must never reuse the previous REST token.
  setApiSession(sessionId);
  // Drop the previous account's cached data. A layout effect runs before any
  // screen's data-loading effects, and (unlike render) may update stores.
  useLayoutEffect(() => flushApiSessionChange(), [sessionId]);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useCrossDomainOneTimeToken();

  // A new fetcher per session (and per retry) makes Convex log in again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchAccessToken = useCallback(() => fetchConvexToken(), [sessionId, attempt]);
  const auth = useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: Boolean(sessionId),
      fetchAccessToken,
    }),
    [isPending, sessionId, fetchAccessToken],
  );
  const useAuth = useCallback(() => auth, [auth]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      <AuthContext.Provider value={{ session, isPending, signOut }}>
        <ConvexAuthWatchdog sessionId={sessionId} onRetry={retry} />
        {children}
      </AuthContext.Provider>
    </ConvexProviderWithAuth>
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  if (!convex) return children;
  return <ConvexAuthBridge client={convex}>{children}</ConvexAuthBridge>;
}

export const useAuthSession = () => useContext(AuthContext);
