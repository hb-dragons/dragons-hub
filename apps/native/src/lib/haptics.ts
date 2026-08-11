import * as Haptics from "expo-haptics";

/**
 * Haptic feedback, named by what it *means* rather than how strong it is.
 *
 * The HIG gives iOS haptics three semantic categories, and every call site in
 * this app has to land in one of them (#218, spec #212):
 *
 * - **notification** — the outcome of a task the user asked for:
 *   `success()`, `warning()`, `error()`.
 * - **selection** — a discrete value changed: `selection()`.
 * - **impact** — two things physically met: `lift()`, `drop()`.
 *
 * Anything that is none of those — a plain navigation tap on a card or a list
 * row — gets no haptic at all. Feedback that fires on every tap stops carrying
 * information, which is why this module deliberately exposes no bare
 * `light()` / `medium()` / `heavy()`: with no semantic name to reach for, a
 * caller picks a strength, and impact feedback drifts onto navigation.
 *
 * Every call is fire-and-forget and swallows rejection: a device with no
 * Taptic Engine (or an Android build where the effect is unsupported) must
 * never turn missing feedback into a failed interaction.
 */
export const haptics = {
  /** Notification — the task the user asked for completed. */
  success: () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  },
  /**
   * Notification — the task completed but carries a caveat: a destructive
   * action just took effect and is still undoable. A *failure* is `error()`.
   */
  warning: () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
  },
  /** Notification — the task the user asked for failed. */
  error: () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
  },
  /** Selection — a discrete value changed: a segment, a filter, a drop target. */
  selection: () => {
    void Haptics.selectionAsync().catch(() => {});
  },
  /**
   * Impact — a drag picked something up. Medium: the app's draggables are
   * moderately sized cards and column pills, not full-screen surfaces.
   */
  lift: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /**
   * Impact — a dragged item landed. Rigid: it snaps into a fixed slot rather
   * than settling, so the collision reads as hard rather than elastic.
   */
  drop: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  },
};
