import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/hooks/useTheme";

/**
 * The composer's floating surface. On iOS 26 (isLiquidGlassAvailable) this is a
 * Liquid Glass capsule — matching the app's NativeTabs/Stack chrome. Elsewhere
 * (Android, iOS < 26) it falls back to a solid surfaceLow capsule with a hairline
 * border. The single swap-point for the surface treatment.
 */
export function ComposerSurface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, isDark } = useTheme();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDark ? "dark" : "light"}
        style={[{ borderRadius: radius.lg, overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceLow,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
