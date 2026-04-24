import { View, Text, Pressable } from "react-native";
import type { TaskCardData } from "@dragons/shared";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
  onLongPress?: (task: TaskCardData) => void;
}

export function TaskCard({ task, onPress, onLongPress }: TaskCardProps) {
  const { colors, spacing, radius } = useTheme();

  let priorityDot: string | null = null;
  if (task.priority === "high") priorityDot = colors.heat;
  else if (task.priority === "urgent") priorityDot = colors.destructive;

  const hasChecklist = task.checklistTotal > 0;
  const firstAssigneeName = task.assignees[0]?.name ?? null;

  return (
    <Pressable
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
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
    </Pressable>
  );
}
