import { localStorage } from "@/lib/local-storage";
import type { PushPermissionStatus } from "./registration";

/**
 * Push pre-permission (#237). § 25(1) TDDDG asks for "klare und umfassende
 * Informationen" before the OS prompt, and iOS only ever shows that prompt
 * once — so the app explains first, and a "Später" costs nothing. The
 * deferral is per device; Profile's notifications row clears it.
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

export async function deferPushPrompt(): Promise<void> {
  await localStorage.setItem(PUSH_PROMPT_DEFERRED_KEY, "1");
}

/** `localStorage` has no remove; "0" reads back as not deferred. */
export async function clearPushPromptDeferral(): Promise<void> {
  await localStorage.setItem(PUSH_PROMPT_DEFERRED_KEY, "0");
}

const STATUS_LABEL_KEYS: Record<PushPermissionStatus, string> = {
  granted: "push.statusGranted",
  denied: "push.statusDenied",
  undetermined: "push.statusUndetermined",
};

export function pushStatusLabelKey(status: PushPermissionStatus): string {
  return STATUS_LABEL_KEYS[status];
}
