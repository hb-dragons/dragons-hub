import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";
import { deviceApi } from "../api";

function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId;
}

/**
 * Request notification permission (if not already granted), acquire the Expo
 * push token, and register it with the API. Safe to call on every app boot —
 * the server upserts by token.
 *
 * No-ops on simulators and when projectId / permission is missing.
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] missing EAS projectId, push disabled");
    return;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const locale = getLocales()[0]?.languageTag;
    const platform = Platform.OS === "android" ? "android" : "ios";
    await deviceApi.register(token, platform, locale);
  } catch (err) {
    console.warn("[push] registration failed", err);
  }
}

/**
 * Delete the current device's token from the server. Call BEFORE clearing
 * the auth session — the DELETE endpoint requires authentication.
 */
export async function unregisterForPush(): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = getProjectId();
  if (!projectId) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await deviceApi.unregister(token);
  } catch (err) {
    console.warn("[push] unregister failed", err);
  }
}
