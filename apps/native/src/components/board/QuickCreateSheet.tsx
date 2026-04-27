import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BoardColumnData, TaskAssignee, TaskPriority } from "@dragons/shared";
import { adminBoardApi } from "@/lib/api";
import { useSWRConfig } from "swr";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { useBoardPickers } from "./BoardPickersProvider";
import { formatDueShort } from "./TaskCard";
import { useToast } from "@/hooks/useToast";
import { haptics } from "@/lib/haptics";
import { multilineInput, singleLineInput } from "@/components/ui/inputStyles";

interface OpenArgs {
  boardId: number;
  columns: BoardColumnData[];
  initialColumnId: number;
}

export interface QuickCreateSheetHandle {
  open: (args: OpenArgs) => void;
}

export const QuickCreateSheet = forwardRef<QuickCreateSheetHandle>(
  function QuickCreateSheet(_p, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [args, setArgs] = useState<OpenArgs | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);
    const [priority, setPriority] = useState<TaskPriority>("normal");
    const [dueDate, setDueDate] = useState<string | null>(null);
    const [assigneeIds, setAssigneeIds] = useState<Set<string>>(() => new Set());
    const [submitting, setSubmitting] = useState(false);
    // Full-height sheet — the create flow has many fields (title, description,
    // column, due, assignees, priority) and needs to live above the keyboard.
    const snapPoints = useMemo(() => ["100%"], []);
    const theme = useTheme();
    const { colors, spacing, radius } = theme;
    const insets = useSafeAreaInsets();
    const { mutate } = useSWRConfig();
    const pickers = useBoardPickers();
    const toast = useToast();

    useImperativeHandle(
      ref,
      () => ({
        open: (next) => {
          setArgs(next);
          setTitle("");
          setDescription("");
          setSelectedColumnId(next.initialColumnId);
          setPriority("normal");
          setDueDate(null);
          setAssigneeIds(new Set());
          sheetRef.current?.present();
        },
      }),
      [],
    );

    const syntheticAssignees: TaskAssignee[] = useMemo(
      () =>
        [...assigneeIds].map((userId) => ({
          userId,
          name: null,
          assignedAt: "",
        })),
      [assigneeIds],
    );

    const openDue = useCallback(() => {
      pickers.openDue(dueDate, (iso) => {
        setDueDate(iso);
      });
    }, [dueDate, pickers]);

    const openAssignees = useCallback(() => {
      pickers.openAssignees(0, syntheticAssignees, (selected) => {
        // No task exists yet — just stash the selection and PUT each
        // assignee after the task is created on submit.
        setAssigneeIds(new Set(selected));
      });
    }, [syntheticAssignees, pickers]);

    const openPriority = useCallback(() => {
      pickers.openPriority(priority, (p) => setPriority(p));
    }, [priority, pickers]);

    const submit = async () => {
      if (!args || selectedColumnId == null) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle || submitting) return;
      setSubmitting(true);
      try {
        const trimmedDescription = description.trim();
        const created = await adminBoardApi.createTask(args.boardId, {
          columnId: selectedColumnId,
          title: trimmedTitle,
          description: trimmedDescription || undefined,
          priority: priority !== "normal" ? priority : undefined,
          dueDate: dueDate ?? undefined,
        });
        if (assigneeIds.size > 0) {
          // Best-effort: report a single toast if any assignment fails.
          const results = await Promise.allSettled(
            [...assigneeIds].map((uid) =>
              adminBoardApi.addAssignee(created.id, uid),
            ),
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            haptics.warning();
            toast.show({
              title: i18n.t("toast.saveFailed"),
              variant: "error",
            });
          }
        }
        await mutate(
          (key) =>
            Array.isArray(key) &&
            key[0] === `admin/boards/${args.boardId}/tasks`,
        );
        sheetRef.current?.dismiss();
      } catch {
        haptics.warning();
        toast.show({ title: i18n.t("toast.saveFailed"), variant: "error" });
      } finally {
        setSubmitting(false);
      }
    };

    const propertyRow = (label: string, value: string, valueMuted: boolean, onPress: () => void) => (
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
          backgroundColor: pressed ? colors.surfaceHigh : "transparent",
        })}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{label}</Text>
        <Text
          style={{
            color: valueMuted ? colors.mutedForeground : colors.foreground,
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
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        topInset={insets.top}
        // v5 defaults this to true, which sizes to content and IGNORES
        // snapPoints. Disable so 100% applies.
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        enablePanDownToClose
        onDismiss={() => setArgs(null)}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView
          testID="quick-create-sheet"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            {i18n.t("board.quickCreate.title")}
          </Text>

          {args?.columns ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {args.columns.map((col) => {
                const active = col.id === selectedColumnId;
                return (
                  <Pressable
                    key={col.id}
                    onPress={() => setSelectedColumnId(col.id)}
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
                    {col.color ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: col.color,
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
                      {col.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <BottomSheetTextInput
            value={title}
            onChangeText={setTitle}
            placeholder={i18n.t("board.quickCreate.titlePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            returnKeyType="next"
            style={singleLineInput(theme, { fontSize: 16, fontWeight: "600" })}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t("board.quickCreate.descriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={multilineInput(theme, { fontSize: 14 })}
          />

          {/* Properties: due, assignees, priority */}
          <View
            style={{
              backgroundColor: colors.surfaceLow,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {propertyRow(
              i18n.t("board.task.due"),
              dueDate ? formatDueShort(dueDate) : i18n.t("board.task.noDue"),
              !dueDate,
              openDue,
            )}
            {divider}
            {propertyRow(
              i18n.t("board.assignees.title"),
              assigneeIds.size === 0
                ? i18n.t("board.assignees.none")
                : i18n.t("board.assignees.count", { count: assigneeIds.size }),
              assigneeIds.size === 0,
              openAssignees,
            )}
            {divider}
            {propertyRow(
              i18n.t("board.task.priority"),
              i18n.t(`board.priority.${priority}`),
              priority === "normal",
              openPriority,
            )}
          </View>

          <Pressable
            onPress={submit}
            disabled={!title.trim() || submitting || selectedColumnId == null}
            accessibilityRole="button"
            style={{
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: title.trim() ? colors.primary : colors.surfaceHigh,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : null}
            <Text
              style={{
                color: title.trim() ? colors.primaryForeground : colors.mutedForeground,
                fontWeight: "700",
              }}
            >
              {i18n.t("board.quickCreate.submit")}
            </Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
