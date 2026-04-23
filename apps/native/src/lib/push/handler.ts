import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";

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

function handleTap(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | null
    | undefined;
  const deepLink = data?.["deepLink"];
  if (typeof deepLink === "string" && deepLink.length > 0) {
    router.push(deepLink as Href);
  }
}

/**
 * Subscribe to taps (live) AND process any cold-start tap (app launched by
 * tapping a notification while killed). Returns an unsubscribe function.
 */
export function subscribeToTaps(): () => void {
  // Live taps (foreground + background resume)
  const sub = Notifications.addNotificationResponseReceivedListener(handleTap);

  // Cold-start tap — listener above does NOT fire for this, check explicitly
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handleTap(response);
  });

  return () => sub.remove();
}
