import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
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

function priorityBadge(
  priority: TaskPriority,
  colors: ReturnType<typeof useTheme>["colors"],
): { bg: string; fg: string } {
  switch (priority) {
    case "urgent":
      return { bg: `${colors.destructive}1F`, fg: colors.destructive };
    case "high":
      return { bg: `${colors.heat}1F`, fg: colors.heat };
    case "low":
      return { bg: colors.surfaceBase, fg: colors.mutedForeground };
    default:
      return { bg: colors.surfaceBase, fg: colors.foreground };
  }
}

function dueState(iso: string | null): "overdue" | "soon" | "later" | null {
  if (!iso) return null;
  const due = new Date(iso).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (due < now) return "overdue";
  if (due - now < 2 * day) return "soon";
  return "later";
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

  const priColors = priorityBadge(task.priority, colors);
  const due = dueState(task.dueDate);
  const dueColor =
    due === "overdue"
      ? colors.destructive
      : due === "soon"
        ? colors.heat
        : colors.foreground;

  const propertyRow = ({
    label,
    value,
    valueColor,
    onPress,
  }: {
    label: string;
    value: string;
    valueColor?: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        backgroundColor: pressed ? colors.surfaceHigh : "transparent",
      })}
    >
      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
        {label}
      </Text>
      <Text
        style={{
          color: valueColor ?? colors.foreground,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {value}
      </Text>
    </Pressable>
  );

  const divider = (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: spacing.md,
      }}
    />
  );

  return (
    <BottomSheetScrollView
      contentContainerStyle={{
        paddingBottom: spacing["3xl"],
      }}
    >
      {/* Header: title + meta */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              fontVariant: ["tabular-nums"],
            }}
          >
            {i18n.t("board.task.idLabel", { id: task.id })}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radius.pill,
              backgroundColor: priColors.bg,
            }}
          >
            <Text
              style={{
                color: priColors.fg,
                fontSize: 11,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {i18n.t(`board.priority.${task.priority}`)}
            </Text>
          </View>
        </View>

        <BottomSheetTextInput
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          style={{
            color: colors.foreground,
            fontSize: 22,
            fontWeight: "700",
            lineHeight: 28,
          }}
          placeholder={i18n.t("board.task.titlePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
      </View>

      {/* Description */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <BottomSheetTextInput
          value={description}
          onChangeText={setDescription}
          onBlur={saveDescription}
          multiline
          style={{
            color: colors.foreground,
            fontSize: 15,
            lineHeight: 21,
            minHeight: 80,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.surfaceLow,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            textAlignVertical: "top",
          }}
          placeholder={i18n.t("board.task.descriptionPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      {/* Properties card */}
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginBottom: spacing.lg,
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {propertyRow({
          label: i18n.t("board.assignees.title"),
          value:
            task.assignees.length === 0
              ? i18n.t("board.assignees.none")
              : task.assignees.length === 1
                ? task.assignees[0]?.name ?? i18n.t("board.task.unnamedUser")
                : i18n.t("board.assignees.count", {
                    count: task.assignees.length,
                  }),
          valueColor:
            task.assignees.length === 0 ? colors.mutedForeground : undefined,
          onPress: () =>
            pickers.openAssignees(
              task.id,
              task.assignees,
              async (userId, add) => {
                if (add) await assigneeMutations.add(task.id, userId);
                else await assigneeMutations.remove(task.id, userId);
              },
            ),
        })}
        {divider}
        {propertyRow({
          label: i18n.t("board.task.priority"),
          value: i18n.t(`board.priority.${task.priority}`),
          onPress: () =>
            pickers.openPriority(task.priority, (p) => {
              void mutations.setPriority(task.id, p);
            }),
        })}
        {divider}
        {propertyRow({
          label: i18n.t("board.task.due"),
          value: task.dueDate
            ? new Date(task.dueDate).toLocaleDateString()
            : i18n.t("board.task.noDue"),
          valueColor: task.dueDate ? dueColor : colors.mutedForeground,
          onPress: () =>
            pickers.openDue(task.dueDate, (iso) => {
              void mutations.setDueDate(task.id, iso);
            }),
        })}
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <ChecklistSection task={task} boardId={boardId} />
        <CommentsSection task={task} />
      </View>
    </BottomSheetScrollView>
  );
}
