import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

/**
 * Renders 4 stacked skeleton rows that match the shape of a real
 * BoardListScreen row (a tall padded card with a wide title bar and
 * an optional 2-line description bar). Used while useBoardList is loading.
 */
export function BoardListSkeleton() {
  const { colors, spacing, radius } = useTheme();
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  const bar = (width: string | number, height = 12, marginTop = 0) => (
    <Animated.View
      style={[
        {
          height,
          borderRadius: 4,
          backgroundColor: colors.surfaceHighest,
          width: width as number,
          marginTop,
        },
        shimmerStyle,
      ]}
    />
  );

  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.md,
      }}
      accessibilityLabel="Loading boards"
      accessibilityRole="progressbar"
      testID="board-list-skeleton"
    >
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceHigh,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          {bar(180, 16)}
          {bar("80%", 12, 8)}
          {bar("60%", 12, 4)}
        </View>
      ))}
    </View>
  );
}
