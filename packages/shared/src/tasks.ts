import type { TaskPriority } from "./constants";

export interface TaskCardData {
  id: number;
  boardId: number;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  columnId: number;
  checklistTotal: number;
  checklistChecked: number;
}

export interface ChecklistItem {
  id: number;
  label: string;
  isChecked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  position: number;
}

export interface TaskComment {
  id: number;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskCardData {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: ChecklistItem[];
  comments: TaskComment[];
}
