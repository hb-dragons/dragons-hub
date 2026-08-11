import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSWRConfig } from "swr";
import type { TaskPriority } from "@dragons/shared";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { PropertyList } from "@/components/board/PropertyList";
import { formatDueShort } from "@/components/board/TaskCard";
import { multilineInput, singleLineInput } from "@/components/ui/inputStyles";
import { useBoard } from "@/hooks/board/useBoard";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { adminBoardApi } from "@/lib/api";
import { sortedColumns } from "@/lib/board/columns";
import { buildCreateTaskInput } from "@/lib/board/create-task-input";
import { parseNumericParam } from "@/lib/board/sheet-params";
import { isBoardTasksKey } from "@/lib/board/task-keys";
import { haptics } from "@/lib/haptics";
import { i18n } from "@/lib/i18n";
import {
  openAssigneePickerSheet,
  openDuePickerSheet,
  openPriorityPickerSheet,
} from "@/lib/nav/board-sheets";

/**
 * Create a task in one of the board's columns (issue #222).
 *
 * Full height rather than a detent pair: the title field takes focus as the
 * sheet opens, so the keyboard covers the bottom half for as long as the sheet
 * is up, and every other field would sit under it.
 *
 * The column the FAB (or a column's + button) started from arrives as a param;
 * the column *list* does not — it comes from the board's SWR key, already warm
 * from the screen underneath, per the scalar-params convention in
 * `lib/nav/sheet-routes.ts`.
 */
export default function QuickCreateSheetRoute() {
  const params = useLocalSearchParams<{ boardId?: string; columnId?: string }>();
  const boardId = parseNumericParam(params.boardId);
  const { data: board } = useBoard(boardId);

  const columns = useMemo(() => sortedColumns(board), [board]);

  const [columnId, setColumnId] = useState<number | null>(() =>
    parseNumericParam(params.columnId),
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const body = buildCreateTaskInput({ columnId, title, description, priority, dueDate });
  const canSubmit = body != null && boardId != null && !submitting;

  const submit = async () => {
    if (!body || boardId == null || submitting) return;
    setSubmitting(true);
    try {
      const created = await adminBoardApi.createTask(boardId, body);
      if (assigneeIds.size > 0) {
        // Best-effort: report a single toast if any assignment fails.
        const results = await Promise.allSettled(
          [...assigneeIds].map((uid) => adminBoardApi.addAssignee(created.id, uid)),
        );
        if (results.some((r) => r.status === "rejected")) {
          haptics.error();
          toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
        }
      }
      await mutate(isBoardTasksKey(boardId));
      router.back();
    } catch {
      haptics.error();
      toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetScreen
      layout="scroll"
      title={i18n.t("board.quickCreate.title")}
      testID="quick-create-sheet"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs }}
      >
        {columns.map((column) => {
          const active = column.id === columnId;
          return (
            <Pressable
              key={column.id}
              onPress={() => setColumnId(column.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.primary : colors.surfaceBase,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
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
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {column.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={i18n.t("board.quickCreate.titlePlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        returnKeyType="next"
        maxLength={300}
        style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
      />

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t("board.quickCreate.descriptionPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={multilineInput(theme, { fontSize: 14 })}
      />

      <PropertyList
        rows={[
          {
            label: i18n.t("board.task.due"),
            value: dueDate ? formatDueShort(dueDate) : i18n.t("board.task.noDue"),
            valueColor: dueDate ? colors.foreground : undefined,
            onPress: () => openDuePickerSheet(dueDate, setDueDate),
          },
          {
            label: i18n.t("board.assignees.title"),
            value:
              assigneeIds.size === 0
                ? i18n.t("board.assignees.none")
                : i18n.t("board.assignees.count", { count: assigneeIds.size }),
            valueColor: assigneeIds.size === 0 ? undefined : colors.foreground,
            // No task exists yet — the selection is stashed and each assignee
            // is added after the task is created on submit.
            onPress: () => openAssigneePickerSheet(assigneeIds, setAssigneeIds),
          },
          {
            label: i18n.t("board.task.priority"),
            value: i18n.t(`board.priority.${priority}`),
            valueColor: priority === "normal" ? undefined : colors.foreground,
            onPress: () => openPriorityPickerSheet(priority, setPriority),
          },
        ]}
      />

      <Pressable
        onPress={() => {
          void submit();
        }}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: canSubmit ? colors.primary : colors.surfaceHigh,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: spacing.sm,
        }}
      >
        {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
        <Text
          style={{
            color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
            fontWeight: "700",
          }}
        >
          {i18n.t("board.quickCreate.submit")}
        </Text>
      </Pressable>
    </SheetScreen>
  );
}
