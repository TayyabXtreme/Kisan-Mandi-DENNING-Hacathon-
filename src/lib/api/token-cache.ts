// The REST client's cached Convex JWT. Lives apart from client.ts so the auth
// provider can clear it without an import cycle.
let cached: { token: string; expiresAt: number; sessionId: string } | null = null;

export const tokenCache = {
  get: (sessionId: string | undefined) =>
    cached && cached.sessionId === sessionId && cached.expiresAt - 60_000 > Date.now()
      ? cached.token
      : null,
  set: (token: string, expiresAt: number, sessionId: string) => {
    cached = { token, expiresAt, sessionId };
  },
  clear: () => {
    cached = null;
  },
};

let currentSession: string | undefined;
let changePending = false;
/**
 * Called by the auth provider (during render) whenever the signed-in session
 * changes. Drops the old token at once; listeners run from
 * flushApiSessionChange, since they update stores and render can't do that.
 */
export function setApiSession(sessionId: string | undefined) {
  if (sessionId === currentSession) return;
  tokenCache.clear();
  currentSession = sessionId;
  changePending = true;
}

/** Runs the session-change listeners once per change (from a layout effect). */
export function flushApiSessionChange() {
  if (!changePending) return;
  changePending = false;
  for (const fn of sessionListeners) fn();
}
export const apiSession = () => currentSession;

const sessionListeners = new Set<() => void>();
/** Runs `fn` whenever the signed-in session changes (e.g. to drop cached data). */
export function onApiSessionChange(fn: () => void) {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}
