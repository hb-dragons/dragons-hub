import { View, Text, ScrollView, Pressable } from "react-native";
import type { TaskCardData, BoardColumnData } from "@dragons/shared";
import { TaskCard, type TaskCardLayout } from "./TaskCard";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

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
}

export function BoardColumn({
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
}: BoardColumnProps) {
  const { colors, spacing, radius } = useTheme();
  const columnTasks = tasks
    .filter((t) => t.columnId === column.id)
    .sort((a, b) => a.position - b.position);

  return (
    <View style={{ width, paddingHorizontal: spacing.sm }}>
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
          contentContainerStyle={{
            padding: spacing.sm,
            gap: spacing.sm,
            paddingBottom: spacing["2xl"],
          }}
          showsVerticalScrollIndicator={false}
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
            />
          ))}
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
}
