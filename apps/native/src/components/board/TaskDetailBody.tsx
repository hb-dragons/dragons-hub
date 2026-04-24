import { useState } from "react";
import { Text, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail } from "@dragons/shared";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

interface Props {
  task: TaskDetail;
  boardId: number;
}

export function TaskDetailBody({ task, boardId }: Props) {
  const { colors, spacing } = useTheme();
  const mutations = useTaskMutations(boardId);

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

  return (
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

      {/* Priority / Due / Assignees / Checklist / Comments slots wired in later phases */}
    </BottomSheetScrollView>
  );
}
