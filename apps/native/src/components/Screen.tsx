import type { ReactNode } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
  /** SafeAreaView edges. Defaults to ["top"]. Use [] for screens with a native Stack header. */
  edges?: Edge[];
  /** Extra top padding to clear a transparent header (e.g. 44 for back button) */
  headerOffset?: number;
}

export function Screen({ children, scroll = true, edges = ["top"], headerOffset }: ScreenProps) {
  const { colors, spacing } = useTheme();

  const containerStyle = {
    flex: 1 as const,
    backgroundColor: colors.background,
  };

  const contentStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    ...(headerOffset ? { paddingTop: headerOffset } : {}),
  };

  return (
    <SafeAreaView style={containerStyle} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
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
