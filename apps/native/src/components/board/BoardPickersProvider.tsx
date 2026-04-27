import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  PriorityPickerSheet,
  type PriorityPickerHandle,
} from "./PriorityPickerSheet";
import { DuePickerSheet, type DuePickerHandle } from "./DuePickerSheet";
import {
  AssigneePickerSheet,
  type AssigneePickerHandle,
} from "./AssigneePickerSheet";
import type { TaskPriority, TaskAssignee } from "@dragons/shared";

interface BoardPickersContextValue {
  openPriority: (current: TaskPriority, onPick: (p: TaskPriority) => void) => void;
  openDue: (current: string | null, onPick: (iso: string | null) => void) => void;
  /**
   * Opens the assignee picker. Selections are batched locally — `onApply`
   * fires once when the user taps Apply (with the final Set of user IDs).
   * The caller is responsible for diffing against `currentAssignees` and
   * running add/remove mutations.
   */
  openAssignees: (
    taskId: number,
    currentAssignees: TaskAssignee[],
    onApply: (selected: Set<string>) => void | Promise<void>,
  ) => void;
}

interface BoardPickersRefs {
  priorityRef: RefObject<PriorityPickerHandle | null>;
  dueRef: RefObject<DuePickerHandle | null>;
  assigneesRef: RefObject<AssigneePickerHandle | null>;
}

const BoardPickersContext = createContext<BoardPickersContextValue | null>(null);
const BoardPickersRefsContext = createContext<BoardPickersRefs | null>(null);

export function useBoardPickers(): BoardPickersContextValue {
  const ctx = useContext(BoardPickersContext);
  if (!ctx) {
    throw new Error("useBoardPickers must be used inside <BoardPickersProvider>");
  }
  return ctx;
}

/**
 * Provides the picker actions context. Place ABOVE BottomSheetModalProvider
 * so portaled bottom-sheet content (which renders at the BSMP host location,
 * losing its source-tree context) can still resolve the provider as an
 * ancestor.
 */
export function BoardPickersProvider({ children }: { children: ReactNode }) {
  const priorityRef = useRef<PriorityPickerHandle | null>(null);
  const dueRef = useRef<DuePickerHandle | null>(null);
  const assigneesRef = useRef<AssigneePickerHandle | null>(null);

  const refs = useMemo<BoardPickersRefs>(
    () => ({ priorityRef, dueRef, assigneesRef }),
    [],
  );

  const value = useMemo<BoardPickersContextValue>(
    () => ({
      openPriority: (current, onPick) =>
        priorityRef.current?.open(current, onPick),
      openDue: (current, onPick) => dueRef.current?.open(current, onPick),
      openAssignees: (taskId, currentAssignees, onApply) =>
        assigneesRef.current?.open(taskId, currentAssignees, onApply),
    }),
    [],
  );

  return (
    <BoardPickersContext.Provider value={value}>
      <BoardPickersRefsContext.Provider value={refs}>
        {children}
      </BoardPickersRefsContext.Provider>
    </BoardPickersContext.Provider>
  );
}

/**
 * Mounts the actual picker bottom sheets. Must be placed INSIDE
 * BottomSheetModalProvider so the sheets' BottomSheetModal can portal.
 */
export function BoardPickersSheets() {
  const refs = useContext(BoardPickersRefsContext);
  if (!refs) {
    throw new Error("<BoardPickersSheets> must be inside <BoardPickersProvider>");
  }
  return (
    <>
      <PriorityPickerSheet ref={refs.priorityRef} />
      <DuePickerSheet ref={refs.dueRef} />
      <AssigneePickerSheet ref={refs.assigneesRef} />
    </>
  );
}
