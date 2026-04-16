import type { ReactNode } from "react";
import { ScrollView, View, StyleSheet, Platform } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
  /** SafeAreaView edges (default: ["top"]). Use [] for screens with a Stack header. */
  edges?: Edge[];
}

export function Screen({ children, scroll = true, edges = ["top"] }: ScreenProps) {
  const { colors, spacing } = useTheme();

  const hasStackHeader = edges.length === 0;

  const containerStyle = {
    flex: 1 as const,
    backgroundColor: colors.background,
  };

  const contentStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  };

  return (
    <SafeAreaView style={containerStyle} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          {...(hasStackHeader && Platform.OS === "ios"
            ? { contentInsetAdjustmentBehavior: "automatic" }
            : {})}
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
