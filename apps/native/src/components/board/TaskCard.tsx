import { View, Text, Pressable } from "react-native";
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

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
  /**
   * Called when drag activates (long-press + move). Layout is in screen coords.
   * When undefined drag is disabled and the card behaves as before.
   */
  onDragStart?: (task: TaskCardData, layout: TaskCardLayout) => void;
  /** Called on every pointer move during drag. Values are absolute screen coords. */
  onDragMove?: (pageX: number, pageY: number) => void;
  /** Called when the drag gesture ends (pointer lifted). */
  onDragEnd?: () => void;
  /** When true the card body is rendered transparent so only the ghost is visible. */
  isBeingDragged?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TaskCard({
  task,
  onPress,
  onLongPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  isBeingDragged = false,
}: TaskCardProps) {
  const { colors, spacing, radius } = useTheme();

  let priorityDot: string | null = null;
  if (task.priority === "high") priorityDot = colors.heat;
  else if (task.priority === "urgent") priorityDot = colors.destructive;

  const hasChecklist = task.checklistTotal > 0;
  const firstAssigneeName = task.assignees[0]?.name ?? null;

  const cardRef = useAnimatedRef<Animated.View>();

  // Only build the drag gesture when callbacks are wired up.
  const dragGesture = (() => {
    if (!onDragStart || !onDragMove || !onDragEnd) {
      // No-op tap so GestureDetector always has a gesture.
      return Gesture.Tap().maxDuration(0);
    }

    const safeStart = onDragStart;
    const safeMove = onDragMove;
    const safeEnd = onDragEnd;

    return Gesture.Pan()
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
        // e.absoluteX/Y is the raw pointer position on screen.
        runOnJS(safeMove)(e.absoluteX, e.absoluteY);
      })
      .onEnd(() => {
        "worklet";
        runOnJS(safeEnd)();
      })
      .onFinalize((_e, success) => {
        "worklet";
        // Fire end on cancel as well (e.g. system interrupt).
        if (!success) {
          runOnJS(safeEnd)();
        }
      });
  })();

  const cardContent = (
    <AnimatedPressable
      ref={cardRef}
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
      // Use a shorter delay when drag is active so the context-menu fires
      // only if the user truly taps-and-holds without moving.
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={task.title}
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

  if (!onDragStart || !onDragMove || !onDragEnd) {
    return cardContent;
  }

  return (
    <GestureDetector gesture={dragGesture}>
      {cardContent}
    </GestureDetector>
  );
}
