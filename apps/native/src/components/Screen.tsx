import { useMemo, type ReactNode } from "react";
import { RefreshControl, ScrollView, View, StyleSheet } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useRefresh, type RefreshFn } from "@/hooks/useRefresh";

const DEFAULT_EDGES: readonly Edge[] = ["top"];

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
  /** SafeAreaView edges. Defaults to ["top"]. Use [] for screens with a native Stack header. */
  edges?: readonly Edge[];
  /** Extra top padding to clear a transparent header (e.g. 44 for back button) */
  headerOffset?: number;
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
  headerOffset,
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
      ...(headerOffset ? { paddingTop: headerOffset + 8 } : {}),
    }),
    [spacing.lg, spacing.xl, headerOffset],
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
