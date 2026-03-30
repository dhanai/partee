/**
 * Registered from the root layout so {@link ./api} can obtain a fresh Clerk JWT after a
 * transient 401 (common when resuming from background with a stale cached token).
 */
type ClerkGetToken = (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;

let getTokenRef: ClerkGetToken | null = null;

export function setApiAuthGetToken(next: ClerkGetToken | null) {
  getTokenRef = next;
}

/** Force-refresh then fall back to cached token — use before treating 401 as session-dead. */
export async function getTokenForApiRetry(): Promise<string | null> {
  const fn = getTokenRef;
  if (!fn) return null;
  try {
    const t = await fn({ skipCache: true });
    if (t) return t;
  } catch {
    /* ignore */
  }
  try {
    const t = await fn();
    return t ?? null;
  } catch {
    return null;
  }
}
