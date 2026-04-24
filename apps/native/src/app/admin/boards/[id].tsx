import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, View, Text, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useBoard } from "@/hooks/board/useBoard";
import { useBoardTasks } from "@/hooks/board/useBoardTasks";
import { useTaskMutations } from "@/hooks/board/useTaskMutations";
import { useMoveTask } from "@/hooks/board/useMoveTask";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPager, type BoardPagerHandle } from "@/components/board/BoardPager";
import { TaskDetailSheet, type TaskDetailSheetHandle } from "@/components/board/TaskDetailSheet";
import { TaskContextMenu, type TaskContextMenuHandle } from "@/components/board/TaskContextMenu";
import { MoveToSheet, type MoveToSheetHandle } from "@/components/board/MoveToSheet";
import { PriorityPickerSheet, type PriorityPickerHandle } from "@/components/board/PriorityPickerSheet";
import { DuePickerSheet, type DuePickerHandle } from "@/components/board/DuePickerSheet";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import type { TaskCardData } from "@dragons/shared";

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);
  const { data: board, isLoading: boardLoading } = useBoard(boardId);
  const { data: tasks, isLoading: tasksLoading } = useBoardTasks(boardId);
  const { colors, spacing } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<BoardPagerHandle | null>(null);
  const taskSheetRef = useRef<TaskDetailSheetHandle | null>(null);
  const contextMenuRef = useRef<TaskContextMenuHandle | null>(null);
  const moveToSheetRef = useRef<MoveToSheetHandle | null>(null);
  const priorityPickerRef = useRef<PriorityPickerHandle | null>(null);
  const duePickerRef = useRef<DuePickerHandle | null>(null);
  const taskMutations = useTaskMutations(boardId);
  const moveTask = useMoveTask(boardId);

  const columns = useMemo(
    () => (board ? [...board.columns].sort((a, b) => a.position - b.position) : []),
    [board],
  );

  const countsByColumn = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tasks ?? []) m.set(t.columnId, (m.get(t.columnId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const onPillPress = useCallback((i: number) => {
    setActiveIndex(i);
    pagerRef.current?.scrollToIndex(i, true);
  }, []);

  const handleTaskLongPress = useCallback((task: TaskCardData) => {
    contextMenuRef.current?.open({
      task,
      onAction: (action) => {
        if (action === "move") {
          moveToSheetRef.current?.open({
            task,
            columns,
            countsByColumn,
            onMove: async (columnId, position) => {
              await moveTask(task.id, columnId, position);
            },
          });
        } else if (action === "priority") {
          priorityPickerRef.current?.open(task.priority, (p) => {
            void taskMutations.setPriority(task.id, p);
          });
        } else if (action === "due") {
          duePickerRef.current?.open(task.dueDate, (iso) => {
            void taskMutations.setDueDate(task.id, iso);
          });
        } else if (action === "delete") {
          Alert.alert(
            i18n.t("board.task.deleteConfirmTitle"),
            i18n.t("board.task.deleteConfirmMessage"),
            [
              { text: i18n.t("common.cancel"), style: "cancel" },
              {
                text: i18n.t("common.delete"),
                style: "destructive",
                onPress: () => {
                  void taskMutations.deleteTask(task.id);
                },
              },
            ],
          );
        }
      },
    });
  }, [columns, countsByColumn, moveTask, taskMutations]);

  if (boardLoading && !board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }
  if (!board) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
        <Text style={{ color: colors.foreground }}>Not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: board.name }} />
      <BoardHeader
        columns={columns}
        tasks={tasks ?? []}
        activeColumnIndex={activeIndex}
        onPillPress={onPillPress}
      />
      <View style={{ flex: 1 }}>
        {tasksLoading && !tasks ? (
          <ActivityIndicator color={colors.foreground} style={{ marginTop: 40 }} />
        ) : (
          <BoardPager
            ref={pagerRef}
            columns={columns}
            tasks={tasks ?? []}
            onActiveColumnChange={setActiveIndex}
            onTaskPress={(task: TaskCardData) => {
              taskSheetRef.current?.open(task.id);
            }}
            onTaskLongPress={handleTaskLongPress}
            onAddTask={() => {
              /* wired in Phase 10 */
            }}
          />
        )}
      </View>
      <TaskDetailSheet ref={taskSheetRef} boardId={boardId} />
      <TaskContextMenu ref={contextMenuRef} />
      <MoveToSheet ref={moveToSheetRef} />
      <PriorityPickerSheet ref={priorityPickerRef} />
      <DuePickerSheet ref={duePickerRef} />
    </View>
  );
}
