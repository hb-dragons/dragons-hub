import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { NOT_FOUND_ROUTE, resolveDeepLink } from "@/lib/nav/href";

/**
 * Install the foreground-presentation handler. Call ONCE at module scope
 * (e.g., at the top of _layout.tsx before the component renders).
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * What the handler knows about the session. `"unknown"` is the cold-start
 * state: better-auth restores the session asynchronously, so a tap can arrive
 * before we can tell a signed-out user from a signed-in one whose session is
 * still loading. Guessing wrong in either direction is user-visible, so a tap
 * is held until the session is definitive.
 */
export type PushAuthState = "unknown" | "signed-in" | "signed-out";

/**
 * Where a signed-out user is sent when the tapped notification points at a
 * session-gated screen. Declared at `app/(auth)/sign-in.tsx`; signing in
 * replays the held link.
 */
export const SIGNED_OUT_FALLBACK = "/(auth)/sign-in";

/**
 * First path segment of every route that renders without a session. Everything
 * else — `/officiating`, `/today`, `/referee-game/:id`, `/profile`, `/admin/*`,
 * `/assistant` — either has no tab trigger or no data for an anonymous user.
 * Route-group segments like `(tabs)` are transparent, so they're dropped first.
 */
const PUBLIC_ROOT_SEGMENTS = new Set([
  "", // "/" — the home tab
  "schedule",
  "standings",
  "teams",
  "game",
  "team",
  "h2h",
  "sign-in",
]);

export function isPublicDeepLink(link: string): boolean {
  const segments = link
    .split("?")[0]!
    .split("#")[0]!
    .split("/")
    .filter((s) => s.length > 0 && !/^\(.+\)$/.test(s));
  return PUBLIC_ROOT_SEGMENTS.has(segments[0] ?? "");
}

let authState: PushAuthState = "unknown";
let pendingDeepLink: string | null = null;
let coldStartProcessed = false;

/**
 * Navigate to a deep link carried by a notification, subject to the auth gate.
 *
 * A link that needs a session is held rather than followed; `setPushAuthState`
 * replays it once the session resolves, or drops the user on a valid public
 * route when they turn out to be signed out.
 *
 * A notification payload is remote input, so the path is resolved against the
 * app's route table (`nav/href.ts`) before it is followed: what reaches the
 * router is a route this build declares, never the raw string. A path no
 * screen backs goes straight to `+not-found` — the screen the router would
 * have landed on anyway, and not worth holding behind a sign-in.
 */
export function followDeepLink(link: string): void {
  if (typeof link !== "string" || !link.startsWith("/")) return;

  const href = resolveDeepLink(link);
  if (href === null) {
    router.push(NOT_FOUND_ROUTE);
    return;
  }

  if (authState === "signed-in" || isPublicDeepLink(link)) {
    router.push(href);
    return;
  }

  pendingDeepLink = link;
  if (authState === "signed-out") router.push(SIGNED_OUT_FALLBACK);
}

/**
 * Report the current session state. Call from the auth tree whenever the
 * session changes; a transition out of `"unknown"` releases any held tap.
 */
export function setPushAuthState(state: PushAuthState): void {
  if (state === authState) return;
  authState = state;
  if (state === "unknown") return;

  const held = pendingDeepLink;
  if (held === null) return;
  pendingDeepLink = null;
  followDeepLink(held);
}

function handleTap(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | null
    | undefined;
  const deepLink = data?.["deepLink"];
  if (typeof deepLink === "string" && deepLink.length > 0) {
    followDeepLink(deepLink);
  }
}

/**
 * Subscribe to taps (live) AND process any cold-start tap (app launched by
 * tapping a notification while killed). Returns an unsubscribe function.
 *
 * The cold-start response is cached by Expo for the session, so hot-reloads
 * or component remounts would re-fire it. Guarded with a module-level flag.
 */
export function subscribeToTaps(): () => void {
  // Live taps (foreground + background resume)
  const sub = Notifications.addNotificationResponseReceivedListener(handleTap);

  // Cold-start tap — listener above does NOT fire for this, check explicitly
  if (!coldStartProcessed) {
    coldStartProcessed = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleTap(response);
    });
  }

  return () => sub.remove();
}

/** Exported for testing only — resets the cold-start guard and the auth gate. */
export function __resetPushHandlerStateForTests(): void {
  coldStartProcessed = false;
  authState = "unknown";
  pendingDeepLink = null;
}
