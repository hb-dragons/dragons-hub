import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail } from "@dragons/shared";
import { useAssigneeMutations } from "@/hooks/board/useAssigneeMutations";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { useBoardPickers } from "./BoardPickersProvider";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";

interface Props {
  task: TaskDetail;
  boardId: number;
}

export function TaskDetailBody({ task, boardId }: Props) {
  const { colors, spacing, radius } = useTheme();
  const mutations = useTaskMutations(boardId);
  const assigneeMutations = useAssigneeMutations(boardId);
  const pickers = useBoardPickers();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) return;
    await mutations.setTitle(task.id, trimmed);
  };

  const saveDescription = async () => {
    const next = description.trim() === "" ? null : description;
    if (next === task.description) return;
    await mutations.setDescription(task.id, next);
  };

  const assigneeSummary =
    task.assignees.length === 0
      ? i18n.t("board.assignees.none")
      : task.assignees.length === 1
        ? (task.assignees[0]?.name ?? i18n.t("board.task.unnamedUser"))
        : i18n.t("board.assignees.count", { count: task.assignees.length });

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceBase,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <>
      <BottomSheetScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <BottomSheetTextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          style={{
            color: colors.foreground,
            fontSize: 20,
            fontWeight: "700",
            paddingVertical: spacing.xs,
          }}
          placeholder={i18n.t("board.task.titlePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {i18n.t("board.task.idLabel", { id: task.id })}
          </Text>
        </View>
        <BottomSheetTextInput
          value={description}
          onChangeText={setDescription}
          onBlur={saveDescription}
          multiline
          style={{
            color: colors.foreground,
            fontSize: 15,
            minHeight: 80,
            paddingVertical: spacing.xs,
          }}
          placeholder={i18n.t("board.task.descriptionPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
        />

        <Pressable
          onPress={() =>
            pickers.openAssignees(
              task.id,
              task.assignees,
              async (userId, add) => {
                if (add) await assigneeMutations.add(task.id, userId);
                else await assigneeMutations.remove(task.id, userId);
              },
            )
          }
          accessibilityRole="button"
          style={rowStyle}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
            {i18n.t("board.assignees.title")}
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
            {assigneeSummary}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            pickers.openPriority(task.priority, (p) => {
              void mutations.setPriority(task.id, p);
            })
          }
          accessibilityRole="button"
          style={rowStyle}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
            {i18n.t("board.task.priority")}
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
            {i18n.t(`board.priority.${task.priority}`)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            pickers.openDue(task.dueDate, (iso) => {
              void mutations.setDueDate(task.id, iso);
            })
          }
          accessibilityRole="button"
          style={rowStyle}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
            {i18n.t("board.task.due")}
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
            {task.dueDate
              ? new Date(task.dueDate).toLocaleDateString()
              : i18n.t("board.task.noDue")}
          </Text>
        </Pressable>

        <ChecklistSection task={task} boardId={boardId} />

        <CommentsSection task={task} />
      </BottomSheetScrollView>

    </>
  );
}
