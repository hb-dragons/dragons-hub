import { useCallback, useRef } from "react";
import { ScrollView, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";

interface BoardHeaderProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  activeColumnIndex: number;
  onPillPress: (index: number) => void;
  onPillLongPress?: (column: BoardColumnData) => void;
  onAddColumnPress?: () => void;
  /** Reorder mode props */
  liftedColumnId?: number | null;
  targetIndex?: number | null;
  onReorderStart?: (column: BoardColumnData) => void;
  onReorderTargetIndex?: (index: number) => void;
  onReorderCommit?: () => void;
  onReorderCancel?: () => void;
}

const PILL_HEIGHT = 44;

export function BoardHeader({
  columns,
  tasks,
  activeColumnIndex,
  onPillPress,
  onPillLongPress,
  onAddColumnPress,
  liftedColumnId,
  targetIndex,
  onReorderStart,
  onReorderTargetIndex,
  onReorderCommit,
  onReorderCancel,
}: BoardHeaderProps) {
  const { colors, spacing, radius } = useTheme();

  // Pill x positions (left edges, in scroll-content coords) keyed by index.
  const pillRectsRef = useRef<Map<number, { x: number; width: number }>>(new Map());

  const onPillLayout = useCallback((index: number, x: number, width: number) => {
    pillRectsRef.current.set(index, { x, width });
  }, []);

  const indexFromX = useCallback((x: number) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    pillRectsRef.current.forEach((r, i) => {
      const centre = r.x + r.width / 2;
      const d = Math.abs(centre - x);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    return bestIndex;
  }, []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
        gap: spacing.xs,
        alignItems: "center",
      }}
    >
      {columns.map((col, i) => {
        const active = i === activeColumnIndex;
        const lifted = col.id === liftedColumnId;
        const count = tasks.filter((t) => t.columnId === col.id).length;
        const indicateDropTarget =
          liftedColumnId != null && targetIndex === i && col.id !== liftedColumnId;

        return (
          <ColumnPill
            key={col.id}
            index={i}
            column={col}
            count={count}
            active={active}
            lifted={lifted}
            indicateDropTarget={indicateDropTarget}
            colors={colors}
            spacing={spacing}
            radius={radius}
            onPress={() => onPillPress(i)}
            onLongPress={onPillLongPress}
            onReorderStart={onReorderStart}
            onReorderPan={(absX) => {
              const idx = indexFromX(absX);
              onReorderTargetIndex?.(idx);
            }}
            onReorderCommit={onReorderCommit}
            onReorderCancel={onReorderCancel}
            onLayoutPosition={onPillLayout}
          />
        );
      })}
      {onAddColumnPress ? (
        <Pressable
          onPress={onAddColumnPress}
          accessibilityRole="button"
          style={{
            height: PILL_HEIGHT,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: "600" }}>+</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// ColumnPill (separated so each pill owns its gesture detector)
// ---------------------------------------------------------------------------

interface ColumnPillProps {
  index: number;
  column: BoardColumnData;
  count: number;
  active: boolean;
  lifted: boolean;
  indicateDropTarget: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  spacing: ReturnType<typeof useTheme>["spacing"];
  radius: ReturnType<typeof useTheme>["radius"];
  onPress: () => void;
  onLongPress?: (column: BoardColumnData) => void;
  onReorderStart?: (column: BoardColumnData) => void;
  onReorderPan?: (absX: number) => void;
  onReorderCommit?: () => void;
  onReorderCancel?: () => void;
  onLayoutPosition: (index: number, x: number, width: number) => void;
}

function ColumnPill({
  index,
  column,
  count,
  active,
  lifted,
  indicateDropTarget,
  colors,
  spacing,
  radius,
  onPress,
  onLongPress,
  onReorderStart,
  onReorderPan,
  onReorderCommit,
  onReorderCancel,
  onLayoutPosition,
}: ColumnPillProps) {
  const scale = useSharedValue(1);
  const elevation = useSharedValue(0);

  // When lifted state flips, animate.
  if (lifted && scale.value !== 1.05) {
    scale.value = withTiming(1.05, { duration: 120 });
    elevation.value = withTiming(8, { duration: 120 });
  } else if (!lifted && scale.value !== 1) {
    scale.value = withTiming(1, { duration: 120 });
    elevation.value = withTiming(0, { duration: 120 });
  }

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    elevation: elevation.value,
    shadowOpacity: elevation.value > 0 ? 0.18 : 0,
  }));

  const reorderGesture = Gesture.Pan()
    .activateAfterLongPress(450)
    .onStart(() => {
      "worklet";
      runOnJS(notifyStart)();
    })
    .onUpdate((e) => {
      "worklet";
      runOnJS(notifyPan)(e.absoluteX);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(notifyCommit)();
    })
    .onFinalize((_e, success) => {
      "worklet";
      if (!success) runOnJS(notifyCancel)();
    });

  function notifyStart() {
    onReorderStart?.(column);
  }
  function notifyPan(x: number) {
    onReorderPan?.(x);
  }
  function notifyCommit() {
    onReorderCommit?.();
  }
  function notifyCancel() {
    onReorderCancel?.();
  }

  const pill = (
    <Animated.View
      onLayout={(e) => {
        onLayoutPosition(index, e.nativeEvent.layout.x, e.nativeEvent.layout.width);
      }}
      style={[
        {
          height: PILL_HEIGHT,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.primary : "transparent",
          borderWidth: indicateDropTarget ? 2 : 1,
          borderColor: indicateDropTarget
            ? colors.primary
            : active
              ? colors.primary
              : colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          opacity: lifted ? 0.9 : 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 12,
        },
        animStyle,
      ]}
    >
      {column.color ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: column.color,
          }}
        />
      ) : null}
      <Text
        style={{
          color: active ? colors.primaryForeground : colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {column.name}
      </Text>
      <Text
        style={{
          color: active ? colors.primaryForeground : colors.mutedForeground,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
          opacity: active ? 0.85 : 1,
        }}
      >
        {count}
      </Text>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={reorderGesture}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress ? () => onLongPress(column) : undefined}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={column.name}
      >
        {pill}
      </Pressable>
    </GestureDetector>
  );
}
