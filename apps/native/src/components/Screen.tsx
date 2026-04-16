import type { ReactNode } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { BackButton } from "./BackButton";

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
  /** Show a floating back button (default: false) */
  backButton?: boolean;
  /** SafeAreaView edges. Defaults to ["top"]. Use [] for screens with a native Stack header. */
  edges?: Edge[];
}

export function Screen({ children, scroll = true, backButton = false, edges = ["top"] }: ScreenProps) {
  const { colors, spacing } = useTheme();

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
      {backButton ? <BackButton /> : null}
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
