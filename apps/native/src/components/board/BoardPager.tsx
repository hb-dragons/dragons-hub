import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import {
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { BoardColumn, type BoardColumnHandle, type ColumnRect } from "./BoardColumn";
import type { TaskCardLayout, TaskRect } from "./TaskCard";

export interface BoardPagerHandle {
  scrollToIndex: (i: number, animated?: boolean) => void;
  getScrollRef: () => ScrollView | null;
}

interface BoardPagerProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  onActiveColumnChange: (i: number) => void;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
  /** ID of the task being dragged — fades out its placeholder. */
  draggingTaskId?: number | null;
  /** Column ID that is currently a valid drop target. */
  dropTargetColumnId?: number | null;
  onTaskDragStart?: (task: TaskCardData, layout: TaskCardLayout) => void;
  onTaskDragMove?: (pageX: number, pageY: number) => void;
  onTaskDragEnd?: () => void;
  /** Called when a column's outer rect is measured. */
  onColumnMeasure?: (columnId: number, rect: ColumnRect) => void;
  /** Called when a task card rect is measured. */
  onTaskMeasure?: (taskId: number, rect: TaskRect) => void;
  /** Called when a column's scroll offset changes. */
  onScrollUpdate?: (columnId: number, y: number) => void;
  /** Refs to individual column scroll views, keyed by column ID. */
  columnRefs?: React.MutableRefObject<Map<number, BoardColumnHandle>>;
}

export const BoardPager = forwardRef<BoardPagerHandle, BoardPagerProps>(
  function BoardPager(
    {
      columns,
      tasks,
      onActiveColumnChange,
      onTaskPress,
      onTaskLongPress,
      onAddTask,
      draggingTaskId,
      dropTargetColumnId,
      onTaskDragStart,
      onTaskDragMove,
      onTaskDragEnd,
      onColumnMeasure,
      onTaskMeasure,
      onScrollUpdate,
      columnRefs,
    },
    ref,
  ) {
    const scrollRef = useRef<ScrollView | null>(null);
    const { width: winWidth } = useWindowDimensions();
    const columnWidth = useMemo(() => Math.round(winWidth * 0.88), [winWidth]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex: (i: number, animated = true) => {
          scrollRef.current?.scrollTo({ x: i * columnWidth, y: 0, animated });
        },
        getScrollRef: () => scrollRef.current,
      }),
      [columnWidth],
    );

    const handleMomentumEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / columnWidth);
        onActiveColumnChange(i);
      },
      [columnWidth, onActiveColumnChange],
    );

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
        snapToInterval={columnWidth}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {columns.map((col) => (
          <BoardColumn
            key={col.id}
            ref={(handle) => {
              if (!columnRefs) return;
              if (handle) {
                columnRefs.current.set(col.id, handle);
              } else {
                columnRefs.current.delete(col.id);
              }
            }}
            column={col}
            tasks={tasks}
            width={columnWidth}
            onTaskPress={onTaskPress}
            onTaskLongPress={onTaskLongPress}
            onAddTask={onAddTask}
            draggingTaskId={draggingTaskId}
            isDropTarget={col.id === dropTargetColumnId}
            onTaskDragStart={onTaskDragStart}
            onTaskDragMove={onTaskDragMove}
            onTaskDragEnd={onTaskDragEnd}
            onColumnMeasure={onColumnMeasure}
            onTaskMeasure={onTaskMeasure}
            onScrollUpdate={onScrollUpdate}
          />
        ))}
      </ScrollView>
    );
  },
);
