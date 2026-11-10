/**
 * How the root layout presents the app lock (#399).
 *
 * The root used to return `null` while locked, which unmounted the navigator:
 * after a background relock and a Face ID unlock, staff landed on `/` instead
 * of the screen (or sheet) they had left. Same class of bug as the AutoFill
 * one `session-gate.ts` fixed. Now the navigator stays mounted from the moment
 * the gate opens, and the lock is drawn over it:
 *
 * - `"splash"`: the native splash stays up. Before the gate opens, and on a
 *   cold start with the lock on while the system prompt runs, so no frame of
 *   content shows before the lock is definitive.
 * - `"overlay"`: cold start, prompt failed. The unlock screen covers the root
 *   view; nothing has been presented over it yet, so that covers everything.
 * - `"route"`: relock after the app was shown. A sheet may be open, and UIKit
 *   draws presented sheets above the root view, so an overlay would not cover
 *   it; the lock is presented as a full-screen modal route on top instead, and
 *   dismissing it returns to exactly what was open.
 * - `"app"`: unlocked.
 */
export type LockPresentation = "splash" | "overlay" | "route" | "app";

export type LockPresentationInput = {
  /** Fonts loaded, session restored once, lock preference read. */
  gateReady: boolean;
  locked: boolean;
  /** The automatic cold-start prompt failed or was cancelled. */
  authFailed: boolean;
  /** The app has been shown unlocked at least once since launch. */
  revealed: boolean;
};

export function lockPresentation(input: LockPresentationInput): LockPresentation {
  if (!input.gateReady) return "splash";
  if (!input.locked) return "app";
  if (input.revealed) return "route";
  return input.authFailed ? "overlay" : "splash";
}

/**
 * Whether the root should push the lock route now (#399).
 *
 * `pushedOver` is the path the lock was last pushed over, so a re-render
 * before the router has moved does not push it twice. Anything that lands on
 * top of the lock while it is up (a notification tap navigates without
 * knowing about the lock) changes the path, and the lock is pushed again
 * over it.
 */
export function lockRoutePush(input: {
  present: boolean;
  pathname: string;
  pushedOver: string | null;
}): boolean {
  if (!input.present || input.pathname === LOCK_PATH) return false;
  return input.pushedOver !== input.pathname;
}

export const LOCK_PATH = "/lock";
