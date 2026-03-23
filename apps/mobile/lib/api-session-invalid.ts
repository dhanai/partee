/**
 * When the API returns 401 for an authenticated request (Bearer token), Clerk may still
 * report isSignedIn — screens keep fetching and hit an infinite error loop. We sign out once.
 */
export class ApiSessionInvalidError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "ApiSessionInvalidError";
  }
}

type Handler = () => Promise<void>;

let handler: Handler | null = null;
let signOutInFlight = false;

export function setApiSessionInvalidHandler(next: Handler | null) {
  handler = next;
}

/** Fire-and-forget: triggers Clerk signOut at most once until it settles. */
export function notifyApiSessionInvalid(): void {
  if (!handler || signOutInFlight) return;
  signOutInFlight = true;
  void handler()
    .catch((e) => {
      console.warn("[Parfade] signOut after invalid API session failed", e);
    })
    .finally(() => {
      signOutInFlight = false;
    });
}
