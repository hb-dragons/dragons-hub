import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { TaskDetail, TaskPriority } from "@dragons/shared";
import { useAssigneeMutations } from "@/hooks/board/useAssigneeMutations";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { diffAssignees } from "@/lib/board/assignee-diff";
import {
  openAssigneePickerSheet,
  openDuePickerSheet,
  openPriorityPickerSheet,
} from "@/lib/nav/board-sheets";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";
import { PropertyList } from "./PropertyList";
import { formatDueShort } from "./TaskCard";
import { SaveIndicator, type SaveState } from "./SaveIndicator";
import { multilineInput } from "@/components/ui/inputStyles";

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

/**
 * The body of the task-detail sheet route (`app/admin/boards/sheets/
 * task-detail.tsx`), which supplies the scroll container and the padding.
 * Sections here carry no horizontal padding of their own.
 */
export function TaskDetailBody({ task, boardId }: Props) {
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const mutations = useTaskMutations(boardId);
  const assigneeMutations = useAssigneeMutations(boardId);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  const [titleSave, setTitleSave] = useState<SaveState>("idle");
  const [descriptionSave, setDescriptionSave] = useState<SaveState>("idle");
  const titleSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending "saved" -> "idle" timers on unmount so they don't fire
  // setState against an unmounted sheet (e.g. the task detail sheet is
  // dismissed right after a save completes).
  useEffect(() => {
    return () => {
      if (titleSavedTimer.current) clearTimeout(titleSavedTimer.current);
      if (descriptionSavedTimer.current) clearTimeout(descriptionSavedTimer.current);
    };
  }, []);

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

  return (
    <>
      {/* Header: title + meta */}
      <View style={{ gap: spacing.sm }}>
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
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => { void saveTitle(); }}
            maxLength={300}
            // Inline title — no surface, no lineHeight (lineHeight on a
            // TextInput shifts placeholder/text down on iOS).
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 22,
              fontWeight: "700",
              padding: 0,
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
      <View style={{ position: "relative" }}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          onBlur={() => { void saveDescription(); }}
          multiline
          // Reserve room on the right for the absolute SaveIndicator
          // overlay (22pt icon + 8pt gap).
          style={[
            multilineInput(theme, { fontSize: 15 }),
            { paddingRight: spacing.md + 22 },
          ]}
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

      <PropertyList
        rows={[
          {
            label: i18n.t("board.assignees.title"),
            value:
              task.assignees.length === 0
                ? i18n.t("board.assignees.none")
                : task.assignees.length === 1
                  ? task.assignees[0]?.name ?? i18n.t("board.task.unnamedUser")
                  : i18n.t("board.assignees.count", { count: task.assignees.length }),
            valueColor: task.assignees.length === 0 ? undefined : colors.foreground,
            onPress: () =>
              openAssigneePickerSheet(
                task.assignees.map((a) => a.userId),
                async (selected) => {
                  // Errors surface as toasts via the mutation hook; rejections
                  // are swallowed here so a partial failure doesn't bubble as
                  // an unhandled rejection.
                  const { added, removed } = diffAssignees(
                    task.assignees.map((a) => a.userId),
                    selected,
                  );
                  await Promise.allSettled([
                    ...added.map((id) => assigneeMutations.add(task.id, id)),
                    ...removed.map((id) => assigneeMutations.remove(task.id, id)),
                  ]);
                },
              ),
          },
          {
            label: i18n.t("board.task.priority"),
            value: i18n.t(`board.priority.${task.priority}`),
            valueColor: colors.foreground,
            onPress: () =>
              openPriorityPickerSheet(task.priority, (p) => {
                // Mutation hook surfaces failures via toast; swallow rejection.
                mutations.setPriority(task.id, p).catch(() => {});
              }),
          },
          {
            label: i18n.t("board.task.due"),
            value: task.dueDate ? formatDueShort(task.dueDate) : i18n.t("board.task.noDue"),
            valueColor: task.dueDate ? dueColor : undefined,
            onPress: () =>
              openDuePickerSheet(task.dueDate, (iso) => {
                mutations.setDueDate(task.id, iso).catch(() => {});
              }),
          },
        ]}
      />

      <ChecklistSection task={task} boardId={boardId} />
      <CommentsSection task={task} />
    </>
  );
}
