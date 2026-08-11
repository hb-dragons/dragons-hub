import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SheetScreen } from "@/components/sheets/SheetScreen";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useMoveTask } from "@/hooks/board/useMoveTask";
import { moveTargetPosition } from "@/lib/board/move-position";
import { parseNumericParam } from "@/lib/board/sheet-params";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function MoveToSheetRoute() {
  const params = useLocalSearchParams<{ boardId?: string; taskId?: string }>();
  const boardId = parseNumericParam(params.boardId);
  const taskId = parseNumericParam(params.taskId);

  // The sheet loads the board itself rather than taking columns through route
  // params (issue #219: scalars only). The board key is the one the screen
  // underneath already filled, so the column list renders straight away. The
  // task list is deliberately the *unfiltered* key — a different key from the
  // screen's, so it fetches once — because the counts below have to describe
  // the whole column, not the filtered view.
  const { data: board } = useBoard(boardId);
  const { data: tasks } = useBoardTasks(boardId);
  const moveTask = useMoveTask(boardId ?? 0);

  const columns = useMemo(
    () => (board ? [...board.columns].sort((a, b) => a.position - b.position) : []),
    [board],
  );

  // Counted over *all* the board's tasks, not the filtered view the board
  // screen happens to be showing: "bottom" means the bottom of the column.
  const countsByColumn = useMemo(() => {
    const counts = new Map<number, number>();
    for (const task of tasks ?? []) counts.set(task.columnId, (counts.get(task.columnId) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const task = tasks?.find((candidate) => candidate.id === taskId) ?? null;

  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { colors, spacing, radius } = useTheme();

  const targetColumnId = selectedColumnId ?? task?.columnId ?? null;

  const confirm = async () => {
    if (taskId == null || targetColumnId == null || submitting) return;
    setSubmitting(true);
    try {
      await moveTask(
        taskId,
        targetColumnId,
        moveTargetPosition({
          placement,
          columnTaskCount: countsByColumn.get(targetColumnId) ?? 0,
          movingWithinColumn: targetColumnId === task?.columnId,
        }),
      );
      router.back();
    } catch {
      // useMoveTask rolled the optimistic move back and toasted the failure.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetScreen layout="scroll" title={i18n.t("board.moveTo.title")} testID="move-to-sheet">
      {columns.length === 0 ? (
        <ActivityIndicator color={colors.foreground} />
      ) : null}

      {columns.map((column) => {
        const selected = column.id === targetColumnId;
        const count = countsByColumn.get(column.id) ?? 0;
        return (
          <Pressable
            key={column.id}
            onPress={() => setSelectedColumnId(column.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: selected ? colors.primary : colors.surfaceBase,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
              {column.color ? (
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: column.color }}
                />
              ) : null}
              <Text
                style={{
                  color: selected ? colors.primaryForeground : colors.foreground,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {column.name}
              </Text>
            </View>
            <Text
              style={{
                color: selected ? colors.primaryForeground : colors.mutedForeground,
                fontSize: 13,
                fontVariant: ["tabular-nums"],
              }}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {(["top", "bottom"] as const).map((option) => {
          const active = placement === option;
          return (
            <Pressable
              key={option}
              onPress={() => setPlacement(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: active ? colors.primary : colors.surfaceBase,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: active ? colors.primaryForeground : colors.foreground,
                  fontWeight: "600",
                }}
              >
                {i18n.t(`board.moveTo.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          void confirm();
        }}
        disabled={targetColumnId == null || submitting}
        accessibilityRole="button"
        style={{
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: spacing.sm,
          marginTop: spacing.sm,
          opacity: targetColumnId == null || submitting ? 0.6 : 1,
        }}
      >
        {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : null}
        <Text style={{ color: colors.primaryForeground, fontWeight: "700", fontSize: 15 }}>
          {i18n.t("board.moveTo.confirm")}
        </Text>
      </Pressable>
    </SheetScreen>
  );
}
