import { useRef, useState } from "react";
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
import { formatDueShort } from "./TaskCard";
import { SaveIndicator, type SaveState } from "./SaveIndicator";

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

  const [titleSave, setTitleSave] = useState<SaveState>("idle");
  const [descriptionSave, setDescriptionSave] = useState<SaveState>("idle");
  const titleSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === task.title) return;
    setTitleSave("saving");
    try {
      await mutations.setTitle(task.id, trimmed);
      setTitleSave("saved");
      if (titleSavedTimer.current) clearTimeout(titleSavedTimer.current);
      titleSavedTimer.current = setTimeout(() => setTitleSave("idle"), 1000);
    } catch {
      // useTaskMutations already toasts on failure.
      setTitleSave("idle");
    }
  };

  const saveDescription = async () => {
    const next = description.trim() === "" ? null : description;
    if (next === task.description) return;
    setDescriptionSave("saving");
    try {
      await mutations.setDescription(task.id, next);
      setDescriptionSave("saved");
      if (descriptionSavedTimer.current) clearTimeout(descriptionSavedTimer.current);
      descriptionSavedTimer.current = setTimeout(() => setDescriptionSave("idle"), 1000);
    } catch {
      setDescriptionSave("idle");
    }
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
      accessibilityHint={i18n.t("a11y.doubleTapToEdit")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        opacity: pressed ? 0.7 : 1,
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

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <BottomSheetTextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            maxLength={300}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 22,
              fontWeight: "700",
              lineHeight: 28,
            }}
            placeholder={i18n.t("board.task.titlePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
          />
          <View style={{ paddingTop: 6 }}>
            <SaveIndicator
              state={titleSave}
              label={
                titleSave === "saving"
                  ? i18n.t("board.task.savingTitle")
                  : titleSave === "saved"
                    ? i18n.t("board.task.savedTitle")
                    : undefined
              }
            />
          </View>
        </View>
        {title.length >= 270 ? (
          <Text
            style={{
              color: title.length >= 300 ? colors.destructive : colors.mutedForeground,
              fontSize: 11,
              fontVariant: ["tabular-nums"],
              alignSelf: "flex-end",
            }}
          >
            {title.length}/300
          </Text>
        ) : null}
      </View>

      {/* Description */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <View style={{ position: "relative" }}>
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
              paddingRight: spacing.md + 22,
              backgroundColor: colors.surfaceLow,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              textAlignVertical: "top",
            }}
            placeholder={i18n.t("board.task.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
          />
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 8, right: 8 }}
          >
            <SaveIndicator
              state={descriptionSave}
              label={
                descriptionSave === "saving"
                  ? i18n.t("board.task.savingTitle")
                  : descriptionSave === "saved"
                    ? i18n.t("board.task.savedTitle")
                    : undefined
              }
            />
          </View>
        </View>
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
          value: task.dueDate ? formatDueShort(task.dueDate) : i18n.t("board.task.noDue"),
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
