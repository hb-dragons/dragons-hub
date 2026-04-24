import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

export function TaskCardSkeleton() {
  const { colors, spacing, radius } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceHigh,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.xs,
          minHeight: 72,
        },
        animatedStyle,
      ]}
    >
      <View style={{ height: 14, width: "70%", borderRadius: 4, backgroundColor: colors.surfaceBase }} />
      <View
        style={{
          height: 10,
          width: "40%",
          borderRadius: 4,
          backgroundColor: colors.surfaceBase,
          marginTop: spacing.xs,
        }}
      />
    </Animated.View>
  );
}
