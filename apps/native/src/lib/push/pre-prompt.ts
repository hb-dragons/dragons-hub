import { localStorage } from "@/lib/local-storage";
import type { PushPermissionStatus } from "./registration";

/**
 * Push pre-permission (#237). § 25(1) TDDDG asks for "klare und umfassende
 * Informationen" before the OS prompt, and iOS only ever shows that prompt
 * once — so the app explains first, and a "Später" costs nothing. The
 * deferral is per device. Profile's Mitteilungen screen asks the OS itself
 * (#398), after which the deferral is never read again.
 */
export const PUSH_PROMPT_DEFERRED_KEY = "push_prompt_deferred";

export type PushFlow = "register" | "prompt" | "none";

export function decidePushFlow({
  isDevice,
  signedIn,
  status,
  deferred,
}: {
  isDevice: boolean;
  signedIn: boolean;
  status: PushPermissionStatus;
  deferred: boolean;
}): PushFlow {
  if (!isDevice || !signedIn) return "none";
  if (status === "granted") return "register";
  if (status === "undetermined" && !deferred) return "prompt";
  return "none";
}

export async function readPushPromptDeferred(): Promise<boolean> {
  try {
    return (await localStorage.getItem(PUSH_PROMPT_DEFERRED_KEY)) === "1";
  } catch {
    return false;
  }
}

async function deferPushPrompt(): Promise<void> {
  await localStorage.setItem(PUSH_PROMPT_DEFERRED_KEY, "1");
}

/**
 * Record that the pre-permission sheet closed without a decision reaching the
 * OS. Only a dismissal a signed-in user actually saw counts (#252): the sheet
 * also unmounts when its `Redirect` bounces a `dragons://push-permission`
 * link opened signed out, and deferring there would suppress the automatic
 * sheet after the next sign-in. Profile's Mitteilungen screen asks the OS
 * directly (#398), and once the OS has answered the flag is never read again.
 */
export async function recordPushSheetDismissal(sawSession: boolean): Promise<void> {
  if (!sawSession) return;
  await deferPushPrompt();
}


const STATUS_LABEL_KEYS: Record<PushPermissionStatus, string> = {
  granted: "push.statusGranted",
  denied: "push.statusDenied",
  undetermined: "push.statusUndetermined",
};

export function pushStatusLabelKey(status: PushPermissionStatus): string {
  return STATUS_LABEL_KEYS[status];
}

/**
 * What the Mitteilungen screen in Profile offers (#398): the OS prompt while
 * it has not been asked, the system settings afterwards — iOS lets the
 * switch be flipped only there. `null` while the status is still being read.
 */
export function notificationsAction(
  status: PushPermissionStatus | null,
): "request" | "openSettings" | null {
  if (status === null) return null;
  return status === "undetermined" ? "request" : "openSettings";
}

/** What the club sends and how, shown before the OS is asked (#237, #398). */
export const PUSH_POINTS = ["push.point1", "push.point2", "push.point3", "push.point4"] as const;
