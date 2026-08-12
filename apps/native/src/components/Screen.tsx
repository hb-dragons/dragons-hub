import { useMemo, type ReactNode } from "react";
import { RefreshControl, ScrollView, View, StyleSheet } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh, type RefreshFn } from "@/hooks/useRefresh";
import { contentInsetBehaviorForEdges } from "@/lib/ui/scroll-inset";

const DEFAULT_EDGES: readonly Edge[] = ["top"];

/**
 * `edges` for a screen that sits under a native stack header.
 *
 * The header reserves the top safe area itself and insets the screen's first
 * scroll view for whatever it occupies, large title included — so the screen
 * must not reserve that space a second time. `Screen` reads this and opts the
 * scroll view into the native inset (see `lib/ui/scroll-inset.ts`), which is
 * what these screens used to approximate with a fixed 44pt of top padding.
 */
export const UNDER_NATIVE_HEADER: readonly Edge[] = [];

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
  /** SafeAreaView edges. Defaults to ["top"]; pass `UNDER_NATIVE_HEADER` under a native Stack header. */
  edges?: readonly Edge[];
  /**
   * Pull-to-refresh handler. When provided and `scroll` is true, a
   * RefreshControl is wired into the internal ScrollView. Pass a single
   * async callback or an array of callbacks (run in parallel).
   *
   * For screens that use their own FlatList/SectionList, use the
   * `useRefresh` hook and wire RefreshControl into the list directly.
   */
  onRefresh?: RefreshFn | readonly RefreshFn[];
}

export function Screen({
  children,
  scroll = true,
  edges = DEFAULT_EDGES,
  onRefresh,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { refreshing, onRefresh: handleRefresh } = useRefresh(onRefresh ?? []);
  const hasRefresh = Boolean(onRefresh);

  // Stabilize style objects. Inline `{ ... }` literals create fresh identities
  // on every render, which causes SafeAreaView / ScrollView to rerun layout
  // passes — disastrous mid-refresh because iOS UIRefreshControl recomputes
  // its refresh-pose inset, leaving the retract animation to start from a
  // stale anchor.
  const containerStyle = useMemo(
    () => ({ flex: 1 as const, backgroundColor: colors.background }),
    [colors.background],
  );

  const contentStyle = useMemo(
    () => ({
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    }),
    [spacing.lg, spacing.xl],
  );

  const refreshControl = useMemo(() => {
    if (!scroll || !hasRefresh) return undefined;
    return (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => {
          void handleRefresh();
        }}
        tintColor={colors.primary}
      />
    );
  }, [scroll, hasRefresh, refreshing, handleRefresh, colors.primary]);

  return (
    <SafeAreaView style={containerStyle} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior={contentInsetBehaviorForEdges(edges)}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollView, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
});
