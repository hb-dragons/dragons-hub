import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import type { TaskCardData, TaskAssignee, TaskPriority } from "@dragons/shared";
import { dueDateBucket, type DueDateBucket } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export interface TaskCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  onDrag?: TaskDragCallbacks;
  isBeingDragged?: boolean;
  /** When true, fire a brief 1 → 1.05 → 1 pulse (consumes the flag once). */
  recentlyDropped?: boolean;
  onMeasure?: (taskId: number, rect: TaskContentRect) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    parts[0].slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)
  ).toUpperCase();
}

/** HSL hash matching the web AssigneeStack. */
function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 45%)`;
}

export function formatDueShort(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "2-digit",
  });
}

/** Returns the user-visible due label for a bucket + raw iso. */
export function formatDueWithBucket(
  iso: string,
  bucket: DueDateBucket | null,
  t: (key: string) => string,
): string {
  if (bucket === "overdue") return t("board.task.dueOverdue");
  if (bucket === "today") return t("board.task.dueToday");
  if (bucket === "soon") {
    // Distinguish tomorrow from "soon".
    const due = new Date(iso);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (
      due.getUTCFullYear() === tomorrow.getUTCFullYear() &&
      due.getUTCMonth() === tomorrow.getUTCMonth() &&
      due.getUTCDate() === tomorrow.getUTCDate()
    ) {
      return t("board.task.dueTomorrow");
    }
  }
  return formatDueShort(iso);
}

/** Returns the colour for a due-date bucket. Falls back to mutedForeground. */
export function dueColorFor(
  bucket: DueDateBucket | null,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (bucket) {
    case "overdue":
      return colors.destructive;
    case "today":
      // The theme's `warning` token may not exist on every codebase.
      // We fall through to the explicit amber as the documented default.
      return ((colors as unknown) as { warning?: string }).warning ?? "#f59e0b";
    case "soon":
      return colors.primary;
    case "later":
    default:
      return colors.mutedForeground;
  }
}

// ---------------------------------------------------------------------------
// Inline SVG icons (no icon lib in native)
// ---------------------------------------------------------------------------

function CalendarIcon({ size = 12, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={2}
        stroke={color}
        strokeWidth={2}
      />
      <Path d="M3 10h18" stroke={color} strokeWidth={2} />
      <Path d="M8 3v4M16 3v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CheckSquareIcon({ size = 12, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 11l3 3L22 4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Priority Badge (matches web variant mapping)
// ---------------------------------------------------------------------------

/**
 * Color of the 4px left-edge stripe.
 * urgent → destructive, high → heat, low → mutedForeground, normal → transparent
 */
export function priorityStripeColor(
  priority: TaskPriority,
  colors: ReturnType<typeof useTheme>["colors"],
): string {
  switch (priority) {
    case "urgent":
      return colors.destructive;
    case "high":
      return colors.heat;
    case "low":
      return colors.mutedForeground;
    default:
      return "transparent";
  }
}

function priorityBadgeStyle(
  priority: TaskPriority,
  colors: ReturnType<typeof useTheme>["colors"],
): { bg: string; fg: string; borderColor: string; borderWidth: number } {
  switch (priority) {
    case "urgent":
      return {
        bg: colors.destructive,
        fg: colors.destructiveForeground,
        borderColor: colors.destructive,
        borderWidth: 0,
      };
    case "high":
      return {
        bg: colors.primary,
        fg: colors.primaryForeground,
        borderColor: colors.primary,
        borderWidth: 0,
      };
    case "low":
      return {
        bg: colors.secondary,
        fg: colors.secondaryForeground,
        borderColor: colors.secondary,
        borderWidth: 0,
      };
    default: // normal → outline
      return {
        bg: "transparent",
        fg: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
      };
  }
}

// ---------------------------------------------------------------------------
// Avatar Stack (matches web with hashed colors)
// ---------------------------------------------------------------------------

interface AvatarStackProps {
  assignees: TaskAssignee[];
  size: number;
  ring: string;
  mutedBg: string;
  mutedFg: string;
  max?: number;
}

function AvatarStack({
  assignees,
  size,
  ring,
  mutedBg,
  mutedFg,
  max,
}: AvatarStackProps) {
  const { width: windowWidth } = useWindowDimensions();
  const effectiveMax = max ?? (windowWidth < 380 ? 2 : 3);
  if (assignees.length === 0) return null;
  const visible = assignees.slice(0, effectiveMax);
  const overflow = assignees.length - visible.length;
  const overlap = Math.round(size * 0.3);
  return (
    <View style={{ flexDirection: "row" }}>
      {visible.map((a, i) => (
        <View
          key={a.userId}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colorFromId(a.userId),
            borderWidth: 2,
            borderColor: ring,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: i === 0 ? 0 : -overlap,
          }}
        >
          <Text
            style={{
              color: "#ffffff",
              fontSize: Math.max(9, Math.round(size * 0.42)),
              fontWeight: "700",
            }}
          >
            {getInitials(a.name)}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: mutedBg,
            borderWidth: 2,
            borderColor: ring,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -overlap,
          }}
        >
          <Text
            style={{
              color: mutedFg,
              fontSize: Math.max(9, Math.round(size * 0.4)),
              fontWeight: "700",
            }}
          >
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

export function TaskCard({
  task,
  onPress,
  onLongPress,
  onDrag,
  isBeingDragged = false,
  recentlyDropped = false,
  onMeasure,
}: TaskCardProps) {
  const { colors, spacing } = useTheme();
  const hasChecklist = task.checklistTotal > 0;
  const pri = priorityBadgeStyle(task.priority, colors);
  const [pressed, setPressed] = useState(false);

  const dropPulse = useSharedValue(1);

  useEffect(() => {
    if (!recentlyDropped) return;
    dropPulse.value = withSequence(
      withTiming(1.05, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    );
  }, [recentlyDropped, dropPulse]);

  const dropPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dropPulse.value }],
  }));

  const cardRef = useAnimatedRef<Animated.View>();

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
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onLayout={handleLayout}
      style={[
        {
          padding: spacing.md,
          borderRadius: 8,
          backgroundColor: pressed ? colors.surfaceHigh : colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.sm,
          opacity: isBeingDragged ? 0 : 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 2,
        },
        dropPulseStyle,
      ]}
    >
      {/* Priority left-edge stripe */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: priorityStripeColor(task.priority, colors),
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
        }}
      />
      {/* Title row + priority badge */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text
          numberOfLines={3}
          style={{
            flex: 1,
            color: colors.foreground,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 18,
          }}
        >
          {task.title}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: pri.bg,
            borderWidth: pri.borderWidth,
            borderColor: pri.borderColor,
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              color: pri.fg,
              fontSize: 10,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {i18n.t(`board.priority.${task.priority}`)}
          </Text>
        </View>
      </View>

      {/* Footer: due date, checklist, assignees */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            flexShrink: 1,
          }}
        >
          {task.dueDate ? (() => {
            const bucket = dueDateBucket(task.dueDate, new Date());
            const dueColour = dueColorFor(bucket, colors);
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <CalendarIcon size={12} color={dueColour} />
                <Text
                  style={{
                    color: dueColour,
                    fontSize: 11,
                    fontWeight: bucket === "overdue" || bucket === "today" ? "700" : "500",
                  }}
                >
                  {formatDueWithBucket(task.dueDate, bucket, i18n.t.bind(i18n))}
                </Text>
              </View>
            );
          })() : null}

          {hasChecklist ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckSquareIcon size={12} color={colors.mutedForeground} />
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 11,
                  fontWeight: "500",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {task.checklistChecked}/{task.checklistTotal}
              </Text>
            </View>
          ) : null}
        </View>

        <AvatarStack
          assignees={task.assignees}
          size={20}
          ring={colors.card}
          mutedBg={colors.muted}
          mutedFg={colors.mutedForeground}
        />
      </View>
    </AnimatedPressable>
  );

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
