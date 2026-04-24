import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import {
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { BoardColumn } from "./BoardColumn";

export interface BoardPagerHandle {
  scrollToIndex: (i: number, animated?: boolean) => void;
}

interface BoardPagerProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  onActiveColumnChange: (i: number) => void;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onAddTask: (columnId: number) => void;
}

export const BoardPager = forwardRef<BoardPagerHandle, BoardPagerProps>(
  function BoardPager(
    { columns, tasks, onActiveColumnChange, onTaskPress, onTaskLongPress, onAddTask },
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
            column={col}
            tasks={tasks}
            width={columnWidth}
            onTaskPress={onTaskPress}
            onTaskLongPress={onTaskLongPress}
            onAddTask={onAddTask}
          />
        ))}
      </ScrollView>
    );
  },
);
