import {
  formatKickoffDayShort,
  resolveDateLocale,
  toClubDateString,
  type AccountClosureStatus,
} from "@dragons/shared";
import type { AlertButton } from "@/lib/auth/sign-out-confirm";

/**
 * The account closure request (#400, ADR-0013): the account is the club's, so
 * "Konto löschen" asks the club to close it rather than deleting anything.
 * These are the decisions the Profile row and the closure screen draw from.
 */

/** Whether the account has a closure request on file. Unknown reads as no. */
export function isClosureRequested(status: AccountClosureStatus | undefined): boolean {
  return Boolean(status?.request);
}

/**
 * The day the request was made, read in the club's zone (the club recorded
 * it there), labelled in the app locale: `Di, 10.11.2026`.
 */
export function closureRequestedDate(requestedAt: string, appLocale: string): string {
  return formatKickoffDayShort(toClubDateString(new Date(requestedAt)), resolveDateLocale(appLocale));
}

export type ClosureScreenState = "loading" | "failed" | "ready" | "submitting" | "requested";

/**
 * What the closure screen shows. A request on file wins over everything: once
 * the club has it, a failed revalidation must not offer the action again.
 */
export function closureScreenState(input: {
  status: AccountClosureStatus | undefined;
  error: unknown;
  submitting: boolean;
}): ClosureScreenState {
  const { status, error, submitting } = input;
  if (status?.request) return "requested";
  if (submitting) return "submitting";
  if (status) return "ready";
  return error ? "failed" : "loading";
}

/**
 * The destructive confirm before the request goes out. Abbrechen cancels;
 * the destructive button sends it. Alert, request and translator come in from
 * the screen, so this runs without React Native.
 */
export function confirmAccountClosure(deps: {
  alert: (title: string, message: string | undefined, buttons: AlertButton[]) => void;
  request: () => Promise<void>;
  t: (key: string) => string;
}): void {
  const { alert, request, t } = deps;
  alert(t("profile.closure.confirmTitle"), t("profile.closure.confirmMessage"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("profile.closure.confirmAction"),
      style: "destructive",
      onPress: () => {
        void request();
      },
    },
  ]);
}
