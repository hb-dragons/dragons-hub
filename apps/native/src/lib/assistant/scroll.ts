import type { UiMessageLike } from "./messages";

/** Tolerance (px) for treating the scroll position as "at the bottom". */
export const NEAR_BOTTOM = 80;

/**
 * Is the scroll position within `threshold` px of the content bottom? Also true
 * when the content fits entirely within the viewport (nothing to scroll).
 */
export function isNearBottom(args: {
  contentOffsetY: number;
  contentHeight: number;
  layoutHeight: number;
  threshold: number;
}): boolean {
  const { contentOffsetY, contentHeight, layoutHeight, threshold } = args;
  if (contentHeight <= layoutHeight) return true;
  return contentHeight - (contentOffsetY + layoutHeight) <= threshold;
}

/**
 * onContentSizeChange decision: only catch-up scroll when the content actually
 * GREW and we are still glued to the bottom. Avoids scrolling on shrink / layout
 * churn (e.g. the keyboard opening).
 */
export function nextFollowScroll(args: {
  prevHeight: number;
  nextHeight: number;
  autoFollow: boolean;
}): { scroll: boolean } {
  return { scroll: args.autoFollow && args.nextHeight > args.prevHeight };
}

/** Re-arm auto-follow only when the user sent a new message this render. */
export function shouldReArmFollow(currentUserCount: number, previousUserCount: number): boolean {
  return currentUserCount > previousUserCount;
}

/** Number of user-authored messages; feeds shouldReArmFollow. */
export function countUserMessages(messages: UiMessageLike[]): number {
  return messages.filter((m) => m.role === "user").length;
}
