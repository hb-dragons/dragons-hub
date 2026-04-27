import { forwardRef, useImperativeHandle, useRef } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import type { TaskCardData, BoardColumnData } from "@dragons/shared";
import { TaskCard, type TaskContentRect, type TaskDragCallbacks } from "./TaskCard";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface BoardColumnHandle {
  /** Imperatively scroll the column's ScrollView. */
  scrollTo: (y: number) => void;
}

interface BoardColumnProps {
  column: BoardColumnData;
  tasks: TaskCardData[];
  width: number;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  /** ID of the task currently being dragged, used to fade out its placeholder. */
  draggingTaskId?: number | null;
  /** Drag callbacks forwarded to each task card. */
  onTaskDrag?: TaskDragCallbacks;
  /** When set, this column is highlighted as a potential drop target. */
  isDropTarget?: boolean;
  /** Called when a task card reports its column-local rect. */
  onTaskMeasure?: (taskId: number, rect: TaskContentRect) => void;
  /**
   * Called when the column's scroll position changes.
   * Also reports the visible viewport height so autoscroll can clamp
   * without needing a separate callback.
   */
  onScrollUpdate?: (columnId: number, scrollY: number, viewportHeight: number) => void;
  /** Called when the ScrollView content height changes (for autoscroll upper bound). */
  onContentSizeChange?: (columnId: number, contentHeight: number) => void;
  /** Called once with the pixel height of the column header above the ScrollView. */
  onHeaderHeight?: (columnId: number, headerHeight: number) => void;
  /** Pull-to-refresh active state. */
  refreshing?: boolean;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void;
}

// Re-export so BoardPager can forward it without importing TaskCard directly.
export type { TaskDragCallbacks };

export const BoardColumn = forwardRef<BoardColumnHandle, BoardColumnProps>(
  function BoardColumn(
    {
      column,
      tasks,
      width,
      onTaskPress,
      onTaskLongPress,
      onAddTask,
      draggingTaskId,
      onTaskDrag,
      isDropTarget = false,
      onTaskMeasure,
      onScrollUpdate,
      onContentSizeChange,
      onHeaderHeight,
      refreshing,
      onRefresh,
    },
    ref,
  ) {
    const { colors, spacing, radius, isDark } = useTheme();
    const columnTasks = tasks
      .filter((t) => t.columnId === column.id)
      .sort((a, b) => a.position - b.position);

    const scrollRef = useRef<ScrollView | null>(null);

    useImperativeHandle(ref, () => ({
      scrollTo: (y: number) => {
        scrollRef.current?.scrollTo({ y, animated: false });
      },
    }), []);

    const handleHeaderLayout = (e: LayoutChangeEvent) => {
      onHeaderHeight?.(column.id, e.nativeEvent.layout.height);
    };

    return (
      <View style={{ width, paddingHorizontal: spacing.sm }}>
        <View
          style={{
            flex: 1,
            // Dark: surfaceLow is darker than card #2a2a2a → card elevates.
            // Light: surfaceHigh #e7e8e9 is darker than card #ffffff → card elevates.
            backgroundColor: isDark ? colors.surfaceLow : colors.surfaceHigh,
            borderRadius: radius.md,
            overflow: "hidden",
            borderWidth: isDropTarget ? 2 : 1,
            borderColor: isDropTarget ? colors.primary : colors.border,
          }}
        >
          <View
            onLayout={handleHeaderLayout}
            style={{
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 }}>
              {column.color ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: column.color,
                  }}
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", flex: 1 }}
              >
                {column.name}
              </Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
              {columnTasks.length}
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              padding: spacing.sm,
              gap: spacing.sm,
              paddingBottom: spacing["2xl"],
            }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.mutedForeground}
                />
              ) : undefined
            }
            onScroll={(e) => {
              onScrollUpdate?.(
                column.id,
                e.nativeEvent.contentOffset.y,
                e.nativeEvent.layoutMeasurement.height,
              );
            }}
            onContentSizeChange={(_w, h) => {
              onContentSizeChange?.(column.id, h);
            }}
          >
            {columnTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onPress={onTaskPress}
                onLongPress={onTaskLongPress}
                isBeingDragged={t.id === draggingTaskId}
                onDrag={onTaskDrag}
                onMeasure={onTaskMeasure}
              />
            ))}
            {columnTasks.length === 0 ? (
              <View style={{ padding: spacing.lg, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
                  {i18n.t("board.column.empty")}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => onAddTask(column.id)}
              style={{
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel={i18n.t("board.column.addCard")}
            >
              <Text style={{ color: colors.mutedForeground }}>
                {i18n.t("board.column.addCard")}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    );
  },
);
