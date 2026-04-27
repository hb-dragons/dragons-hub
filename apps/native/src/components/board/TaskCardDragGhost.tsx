import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { View, Text } from "react-native";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { formatDueShort } from "./TaskCard";

interface TaskCardDragGhostProps {
  task: TaskCardData;
  /** Absolute screen X of the ghost centre (pointer X) */
  pointerX: SharedValue<number>;
  /** Absolute screen Y of the ghost centre (pointer Y) */
  pointerY: SharedValue<number>;
  /** Original card width, used to size the ghost */
  cardWidth: number;
  /** Original card height, used to size the ghost */
  cardHeight: number;
}

export function TaskCardDragGhost({
  task,
  pointerX,
  pointerY,
  cardWidth,
  cardHeight,
}: TaskCardDragGhostProps) {
  const { colors, spacing, radius } = useTheme();

  let priorityDot: string | null = null;
  if (task.priority === "high") priorityDot = colors.heat;
  else if (task.priority === "urgent") priorityDot = colors.destructive;

  const hasChecklist = task.checklistTotal > 0;
  const firstAssigneeName = task.assignees[0]?.name ?? null;

  // Spring scale: 1 → 1.04, slight bounce.
  const scale = useSharedValue(1);
  // Track previous pointer X on the worklet thread for velocity derivation.
  const prevX = useSharedValue(pointerX.value);
  const velocityX = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1.04, { damping: 12, stiffness: 220, mass: 0.6 });
  }, [scale]);

  // Worklet-derived horizontal velocity (px per frame, smoothed).
  useDerivedValue(() => {
    const dx = pointerX.value - prevX.value;
    // Low-pass filter so a single jitter doesn't flip the tilt.
    velocityX.value = velocityX.value * 0.7 + dx * 0.3;
    prevX.value = pointerX.value;
  });

  const ghostStyle = useAnimatedStyle(() => {
    // Map -20..20 px/frame velocity to -2..2 degrees.
    const rotateDeg = interpolate(
      velocityX.value,
      [-20, 0, 20],
      [-2, 0, 2],
      Extrapolation.CLAMP,
    );
    return {
      position: "absolute",
      left: pointerX.value - cardWidth / 2,
      top: pointerY.value - cardHeight / 2,
      width: cardWidth,
      height: cardHeight,
      transform: [{ scale: scale.value }, { rotate: `${rotateDeg}deg` }],
      opacity: 0.92,
      pointerEvents: "none",
    };
  });

  return (
    <Animated.View style={ghostStyle} pointerEvents="none">
      <View
        style={{
          flex: 1,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceBase,
          borderWidth: 1,
          borderColor: colors.primary,
          gap: spacing.xs,
          minHeight: 72,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 14,
          elevation: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          {priorityDot ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priorityDot }} />
          ) : null}
          <Text
            numberOfLines={2}
            style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: "600" }}
          >
            {task.title}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
          {task.dueDate ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {formatDueShort(task.dueDate)}
            </Text>
          ) : null}
          {hasChecklist ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {task.checklistChecked}/{task.checklistTotal}
            </Text>
          ) : null}
          {task.assignees.length === 1 && firstAssigneeName ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {firstAssigneeName}
            </Text>
          ) : task.assignees.length > 1 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {i18n.t("board.task.assigneeCount", { count: task.assignees.length })}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
