import { haptics } from "@/lib/haptics";
import { i18n } from "@/lib/i18n";

export type ToastFailKey = "toast.saveFailed" | "toast.deleteFailed" | "toast.createFailed";

/** Minimal shape of `useToast()`'s return value that `withErrorToast` needs. */
export interface ErrorToastHost {
  show: (args: { title: string; variant: "error" }) => void;
}

/**
 * Runs `fn`; on rejection fires an error haptic and an error toast titled
 * with `failKey`'s translation, then re-throws so callers can still branch
 * on failure. The single implementation shared by the board mutation hooks
 * (`useAssigneeMutations`, `useColumnMutations`, `useCommentMutations`) —
 * previously copied three times and drifted: the assignee hook hardcoded
 * "toast.saveFailed" for every operation, so a failed *removal* reported
 * "save failed".
 */
export async function withErrorToast<T>(
  fn: () => Promise<T>,
  failKey: ToastFailKey,
  toast: ErrorToastHost,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    haptics.error();
    toast.show({ title: i18n.t(failKey), variant: "error" });
    throw error;
  }
}
