import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export type ToastVariant = "default" | "success" | "error";

export interface ToastProps {
  title: string;
  variant?: ToastVariant;
  /** Optional action button (e.g. Undo). */
  action?: { label: string; onPress: () => void };
  /** Auto-dismiss after this many ms. Defaults to 4000. */
  durationMs?: number;
  onDismiss: () => void;
}

export function Toast({
  title,
  variant = "default",
  action,
  durationMs = 4000,
  onDismiss,
}: ToastProps) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withTiming(0, { duration: 180 });

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      });
      translateY.value = withTiming(20, { duration: 180 });
    }, durationMs);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const bg =
    variant === "error"
      ? colors.destructive
      : variant === "success"
        ? colors.primary
        : colors.surfaceHighest;
  const fg =
    variant === "error"
      ? colors.destructiveForeground
      : variant === "success"
        ? colors.primaryForeground
        : colors.foreground;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: spacing.lg,
          right: spacing.lg,
          bottom: insets.bottom + spacing.lg,
        },
        animStyle,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          gap: spacing.md,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: fg,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {action ? (
          <Pressable
            onPress={() => {
              action.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            hitSlop={12}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
          >
            <Text
              style={{
                color: fg,
                fontSize: 14,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
