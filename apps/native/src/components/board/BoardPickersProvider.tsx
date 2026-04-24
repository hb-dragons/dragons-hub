import { createContext, useContext, useRef, type ReactNode } from "react";
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
  openAssignees: (
    taskId: number,
    currentAssignees: TaskAssignee[],
    onToggle: (userId: string, add: boolean) => void | Promise<void>,
  ) => void;
}

const BoardPickersContext = createContext<BoardPickersContextValue | null>(null);

export function useBoardPickers(): BoardPickersContextValue {
  const ctx = useContext(BoardPickersContext);
  if (!ctx) {
    throw new Error("useBoardPickers must be used inside <BoardPickersProvider>");
  }
  return ctx;
}

export function BoardPickersProvider({ children }: { children: ReactNode }) {
  const priorityRef = useRef<PriorityPickerHandle>(null);
  const dueRef = useRef<DuePickerHandle>(null);
  const assigneesRef = useRef<AssigneePickerHandle>(null);

  const value: BoardPickersContextValue = {
    openPriority: (current, onPick) => priorityRef.current?.open(current, onPick),
    openDue: (current, onPick) => dueRef.current?.open(current, onPick),
    openAssignees: (taskId, currentAssignees, onToggle) =>
      assigneesRef.current?.open(taskId, currentAssignees, onToggle),
  };

  return (
    <BoardPickersContext.Provider value={value}>
      {children}
      <PriorityPickerSheet ref={priorityRef} />
      <DuePickerSheet ref={dueRef} />
      <AssigneePickerSheet ref={assigneesRef} />
    </BoardPickersContext.Provider>
  );
}
