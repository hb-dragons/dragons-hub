import { SplashScreen } from "@capacitor/splash-screen";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

async function initApp() {
  await SplashScreen.hide();

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive === "granted") {
    await PushNotifications.register();
  }

  PushNotifications.addListener("registration", async (token) => {
    const platform = Capacitor.getPlatform();
    await fetch(`${window.location.origin}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: token.value, platform }),
    }).catch(console.error);
  });

  PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      console.log("Push notification received:", notification);
    },
  );

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const data = action.notification.data;
      if (data?.url) {
        window.location.href = data.url as string;
      }
    },
  );

  const { value: biometricEnabled } = await Preferences.get({
    key: "biometric_lock_enabled",
  });

  if (biometricEnabled === "true") {
    try {
      const { BiometricAuth } = await import(
        "@aparajita/capacitor-biometric-auth"
      );
      await BiometricAuth.authenticate({
        reason: "Unlock Dragons",
        allowDeviceCredential: true,
      });
    } catch {
      console.warn("Biometric authentication failed or cancelled");
    }
  }
}

if (document.readyState === "complete") {
  initApp();
} else {
  document.addEventListener("DOMContentLoaded", initApp);
}
