import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import type { TaskCardData, BoardColumnData } from "@dragons/shared";
import { TaskCard, type TaskCardLayout, type TaskRect } from "./TaskCard";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export interface ColumnRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  /** Called when a task card activates drag. */
  onTaskDragStart?: (task: TaskCardData, layout: TaskCardLayout) => void;
  /** Called on every drag move with absolute pointer coords. */
  onTaskDragMove?: (pageX: number, pageY: number) => void;
  /** Called when drag ends. */
  onTaskDragEnd?: () => void;
  /** When set, this column is highlighted as a potential drop target. */
  isDropTarget?: boolean;
  /** Called when this column's outer container is measured in screen coords. */
  onColumnMeasure?: (columnId: number, rect: ColumnRect) => void;
  /** Called when a task card reports its screen rect. */
  onTaskMeasure?: (taskId: number, rect: TaskRect) => void;
  /** Called when the scroll position changes. */
  onScrollUpdate?: (columnId: number, y: number) => void;
}

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
      onTaskDragStart,
      onTaskDragMove,
      onTaskDragEnd,
      isDropTarget = false,
      onColumnMeasure,
      onTaskMeasure,
      onScrollUpdate,
    },
    ref,
  ) {
    const { colors, spacing, radius } = useTheme();
    const columnTasks = tasks
      .filter((t) => t.columnId === column.id)
      .sort((a, b) => a.position - b.position);

    const scrollRef = useRef<ScrollView | null>(null);
    const outerRef = useRef<View | null>(null);

    useImperativeHandle(ref, () => ({
      scrollTo: (y: number) => {
        scrollRef.current?.scrollTo({ y, animated: false });
      },
    }), []);

    const measureColumn = useCallback(() => {
      if (!onColumnMeasure) return;
      const t = setTimeout(() => {
        outerRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            onColumnMeasure(column.id, { x, y, width: w, height: h });
          }
        });
      }, 50);
      return t;
    }, [onColumnMeasure, column.id]);

    useEffect(() => {
      const t = measureColumn();
      return () => {
        if (t !== undefined) clearTimeout(t);
      };
    }, [measureColumn, width]);

    return (
      <View
        ref={outerRef}
        style={{ width, paddingHorizontal: spacing.sm }}
        onLayout={measureColumn}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.surfaceLow,
            borderRadius: radius.md,
            overflow: "hidden",
            borderWidth: isDropTarget ? 2 : 0,
            borderColor: isDropTarget ? colors.primary : "transparent",
          }}
        >
          <View
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
            onScroll={(e) => {
              onScrollUpdate?.(column.id, e.nativeEvent.contentOffset.y);
            }}
          >
            {columnTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onPress={onTaskPress}
                onLongPress={onTaskLongPress}
                isBeingDragged={t.id === draggingTaskId}
                onDragStart={onTaskDragStart}
                onDragMove={onTaskDragMove}
                onDragEnd={onTaskDragEnd}
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
