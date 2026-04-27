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
 * Shape-matches the real TaskCard: padding, radius, shadow, three stacked
 * title bars, and a footer row with date + assignees. Shimmer animates
 * the inner skeleton bars' opacity 0.4 ↔ 0.7 over 1200 ms.
 */
export function TaskCardSkeleton() {
  const { colors, spacing } = useTheme();
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

  const bar = (width: string | number, marginTop = 0) => (
    <Animated.View
      style={[
        {
          height: 12,
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
        padding: spacing.md,
        borderRadius: 8,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      {/* Title (3 lines, varying widths) */}
      <View style={{ gap: 4 }}>
        {bar("90%")}
        {bar("75%", 4)}
        {bar("55%", 4)}
      </View>

      {/* Footer: date + assignees row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: spacing.xs,
        }}
      >
        <Animated.View
          style={[
            {
              height: 10,
              width: 64,
              borderRadius: 4,
              backgroundColor: colors.surfaceHighest,
            },
            shimmerStyle,
          ]}
        />
        <View style={{ flexDirection: "row" }}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                {
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.surfaceHighest,
                  borderWidth: 2,
                  borderColor: colors.card,
                  marginLeft: i === 0 ? 0 : -6,
                },
                shimmerStyle,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
