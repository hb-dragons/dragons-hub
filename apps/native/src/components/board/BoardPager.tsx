import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import {
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { BoardColumnData, TaskCardData } from "@dragons/shared";
import { BoardColumn, type BoardColumnHandle, type TaskDragCallbacks } from "./BoardColumn";
import type { TaskContentRect } from "./TaskCard";

export interface BoardPagerHandle {
  scrollToIndex: (i: number, animated?: boolean) => void;
  getScrollRef: () => ScrollView | null;
  /** Returns the current horizontal scroll offset of the pager (JS-side, safe to read synchronously). */
  getScrollX: () => number;
}

export interface PagerLayout {
  /** Screen x of the pager's left edge. */
  pageX: number;
  /** Screen y of the pager's top edge. */
  pageY: number;
  /** Total rendered width of the pager (== window width). */
  width: number;
  /** Visible height of the pager. */
  height: number;
}

interface BoardPagerProps {
  columns: BoardColumnData[];
  tasks: TaskCardData[];
  onActiveColumnChange: (i: number) => void;
  onTaskPress: (task: TaskCardData) => void;
  onTaskLongPress?: (task: TaskCardData) => void;
  onColumnLongPress?: (column: BoardColumnData) => void;
  onAddTask: (columnId: number) => void;
  /** ID of the task being dragged — fades out its placeholder. */
  draggingTaskId?: number | null;
  /** Column ID that is currently a valid drop target. */
  dropTargetColumnId?: number | null;
  /** Task ID of the most recently dropped card (fires drop-pulse). */
  recentlyDroppedTaskId?: number | null;
  /** Drag callbacks forwarded to task cards. */
  onTaskDrag?: TaskDragCallbacks;
  /** Called when a task card reports its column-local rect. */
  onTaskMeasure?: (taskId: number, rect: TaskContentRect) => void;
  /** Called when a column's scroll position changes. */
  onColumnScrollUpdate?: (columnId: number, scrollY: number, viewportHeight: number) => void;
  /** Called when a column's content height changes. */
  onColumnContentSizeChange?: (columnId: number, contentHeight: number) => void;
  /** Called when the column header height is measured. */
  onColumnHeaderHeight?: (columnId: number, headerHeight: number) => void;
  /** Called when the pager's horizontal scroll offset changes. */
  onPagerScrollUpdate?: (scrollX: number) => void;
  /** Called once with the pager's screen layout. */
  onPagerLayout?: (layout: PagerLayout) => void;
  /** Refs to individual column scroll views, keyed by column ID. */
  columnRefs?: React.MutableRefObject<Map<number, BoardColumnHandle>>;
  /** Pull-to-refresh active state, forwarded to each column. */
  refreshing?: boolean;
  /** Pull-to-refresh handler, forwarded to each column. */
  onRefresh?: () => void;
  /** When false, the pager's horizontal scroll is disabled (used during column reorder). */
  scrollEnabled?: boolean;
}

export const BoardPager = forwardRef<BoardPagerHandle, BoardPagerProps>(
  function BoardPager(
    {
      columns,
      tasks,
      onActiveColumnChange,
      onTaskPress,
      onTaskLongPress,
      onColumnLongPress,
      onAddTask,
      draggingTaskId,
      dropTargetColumnId,
      recentlyDroppedTaskId,
      onTaskDrag,
      onTaskMeasure,
      onColumnScrollUpdate,
      onColumnContentSizeChange,
      onColumnHeaderHeight,
      onPagerScrollUpdate,
      onPagerLayout,
      columnRefs,
      refreshing,
      onRefresh,
      scrollEnabled = true,
    },
    ref,
  ) {
    const scrollRef = useRef<ScrollView | null>(null);
    const scrollXRef = useRef(0);
    const { width: winWidth } = useWindowDimensions();
    const columnWidth = useMemo(() => Math.round(winWidth * 0.88), [winWidth]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex: (i: number, animated = true) => {
          scrollRef.current?.scrollTo({ x: i * columnWidth, y: 0, animated });
        },
        getScrollRef: () => scrollRef.current,
        getScrollX: () => scrollXRef.current,
      }),
      [columnWidth],
    );

    const handleMomentumEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = e.nativeEvent.contentOffset.x;
        scrollXRef.current = x;
        onPagerScrollUpdate?.(x);
        const i = Math.round(x / columnWidth);
        onActiveColumnChange(i);
      },
      [columnWidth, onActiveColumnChange, onPagerScrollUpdate],
    );

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = e.nativeEvent.contentOffset.x;
        scrollXRef.current = x;
        onPagerScrollUpdate?.(x);
      },
      [onPagerScrollUpdate],
    );

    const handlePagerLayout = useCallback(
      (e: LayoutChangeEvent) => {
        if (!onPagerLayout) return;
        const { width, height } = e.nativeEvent.layout;
        // measureInWindow is needed for screen-absolute pageX/pageY.
        // We use requestAnimationFrame to let the layout settle first.
        const outerRef = scrollRef.current;
        if (!outerRef) return;
        const raf = requestAnimationFrame(() => {
          // @ts-expect-error — measureInWindow exists on host components
          outerRef.measureInWindow((px: number, py: number) => {
            onPagerLayout({ pageX: px, pageY: py, width, height });
          });
        });
        return () => cancelAnimationFrame(raf);
      },
      [onPagerLayout],
    );

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={scrollEnabled}
        decelerationRate="fast"
        snapToInterval={columnWidth}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        onLayout={handlePagerLayout}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "stretch" }}
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
            onColumnLongPress={onColumnLongPress}
            onAddTask={onAddTask}
            draggingTaskId={draggingTaskId}
            isDropTarget={col.id === dropTargetColumnId}
            recentlyDroppedTaskId={recentlyDroppedTaskId}
            onTaskDrag={onTaskDrag}
            onTaskMeasure={onTaskMeasure}
            onScrollUpdate={onColumnScrollUpdate}
            onContentSizeChange={onColumnContentSizeChange}
            onHeaderHeight={onColumnHeaderHeight}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ))}
      </ScrollView>
    );
  },
);
