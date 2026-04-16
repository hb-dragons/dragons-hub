import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { deviceApi } from "@/lib/api";

// Show notification alerts when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function registerForPush() {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;

        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") return;

        const pushToken = await Notifications.getExpoPushTokenAsync();
        tokenRef.current = pushToken.data;

        if (cancelled) return;

        const platform = Platform.OS === "ios" ? "ios" : "android";
        await deviceApi.register(pushToken.data, platform);
      } catch {
        // Silent failure — push registration is non-critical
      }
    }

    void registerForPush();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Listen for notification taps and navigate to deep link
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string") {
          router.push(url as never);
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [router]);
}
