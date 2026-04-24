import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  measure,
  runOnJS,
  useAnimatedRef,
} from "react-native-reanimated";

export interface TaskCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Card rect in column-content-local coordinates.
 * `contentX` / `contentY` are the card's position inside the column's
 * ScrollView content container (as reported by onLayout). This is
 * stale-proof under parent scroll because the scroll offset is tracked
 * separately and added at hit-test time.
 */
export interface TaskContentRect {
  contentX: number;
  contentY: number;
  width: number;
  height: number;
  columnId: number;
}

export interface TaskDragCallbacks {
  start: (task: TaskCardData, layout: TaskCardLayout) => void;
  move: (pageX: number, pageY: number) => void;
  end: () => void;
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
  /**
   * Drag callbacks bundled together. When undefined the card is not
   * draggable and GestureDetector is omitted entirely.
   */
  onDrag?: TaskDragCallbacks;
  /** When true the card body is rendered transparent so only the ghost is visible. */
  isBeingDragged?: boolean;
  /**
   * Called with the card's column-local rect after every layout.
   * Lets the parent track drop targets without stale screen coords.
   */
  onMeasure?: (taskId: number, rect: TaskContentRect) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TaskCard({
  task,
  onPress,
  onLongPress,
  onDrag,
  isBeingDragged = false,
  onMeasure,
}: TaskCardProps) {
  const { colors, spacing, radius } = useTheme();

  let priorityDot: string | null = null;
  if (task.priority === "high") priorityDot = colors.heat;
  else if (task.priority === "urgent") priorityDot = colors.destructive;

  const hasChecklist = task.checklistTotal > 0;
  const firstAssigneeName = task.assignees[0]?.name ?? null;

  // Animated ref for worklet-side measurement (gesture start).
  const cardRef = useAnimatedRef<Animated.View>();

  // Report layout in parent-local coords via onLayout on the Pressable itself.
  // onLayout gives the full border-box including padding, stale-proof under
  // parent scroll because contentY is relative to the scroll container.
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (!onMeasure) return;
      const { x, y, width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        onMeasure(task.id, {
          contentX: x,
          contentY: y,
          width,
          height,
          columnId: task.columnId,
        });
      }
    },
    [onMeasure, task.id, task.columnId],
  );

  const cardContent = (
    <AnimatedPressable
      ref={cardRef}
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onLayout={handleLayout}
      style={({ pressed }) => ({
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceBase,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
        minHeight: 72,
        opacity: isBeingDragged ? 0 : 1,
      })}
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
            {new Date(task.dueDate).toLocaleDateString()}
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
    </AnimatedPressable>
  );

  // No drag — return the card without a gesture wrapper.
  if (!onDrag) {
    return cardContent;
  }

  const { start: safeStart, move: safeMove, end: safeEnd } = onDrag;

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      "worklet";
      const m = measure(cardRef);
      if (!m) return;
      runOnJS(safeStart)(task, {
        x: m.pageX,
        y: m.pageY,
        width: m.width,
        height: m.height,
      });
    })
    .onUpdate((e) => {
      "worklet";
      runOnJS(safeMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(safeEnd)();
    })
    .onFinalize((_e, success) => {
      "worklet";
      if (!success) {
        runOnJS(safeEnd)();
      }
    });

  return (
    <GestureDetector gesture={dragGesture}>
      {cardContent}
    </GestureDetector>
  );
}
