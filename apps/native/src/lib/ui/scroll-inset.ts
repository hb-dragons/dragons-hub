import type { Edge } from "react-native-safe-area-context";

/**
 * Picks the iOS `contentInsetAdjustmentBehavior` for a scrollable inside a
 * `Screen`.
 *
 * When the `Screen` reserves its own top inset via SafeAreaView (`edges`
 * includes "top"), the scroll view must NOT also auto-adjust — that would
 * double-inset and push content down twice. Use "never".
 *
 * When there is no top SafeAreaView edge, the screen sits under a native-stack
 * header (large title / search bar). There the native stack only insets the
 * content if the scroll view opts in with "automatic"; without it, content is
 * cut off under the header. Use "automatic".
 */
export function contentInsetBehaviorForEdges(
  edges: readonly Edge[],
): "automatic" | "never" {
  return edges.includes("top") ? "never" : "automatic";
}
