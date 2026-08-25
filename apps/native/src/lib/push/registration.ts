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

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

/**
 * The OS permission state, collapsed to what the pre-permission flow needs.
 * iOS reports `undetermined` with `canAskAgain: false` after a hard deny;
 * that is a denial for our purposes — the prompt would be a no-op.
 */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "undetermined" && canAskAgain !== false) return "undetermined";
  return "denied";
}

async function registerToken(projectId: string): Promise<void> {
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
 * Acquire the Expo push token and register it with the API when permission is
 * already granted. Safe to call on every app boot — the server upserts by
 * token. Never triggers the OS prompt: § 25(1) TDDDG wants an explanation
 * first, which is `app/push-permission.tsx` (#237) calling
 * `requestPushPermissionAndRegister`.
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

  if ((await getPushPermissionStatus()) !== "granted") return;
  await registerToken(projectId);
}

/** The one call site of the OS prompt. Registers on grant. */
export async function requestPushPermissionAndRegister(): Promise<PushPermissionStatus> {
  if (!Device.isDevice) return "denied";

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] missing EAS projectId, push disabled");
    return "denied";
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return "denied";
  await registerToken(projectId);
  return "granted";
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
