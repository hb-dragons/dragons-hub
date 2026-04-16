import type { ReactNode } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface ScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView (default: true) */
  scroll?: boolean;
}

export function Screen({ children, scroll = true }: ScreenProps) {
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
    <SafeAreaView style={containerStyle} edges={["top"]}>
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
