import type { TaskPriority } from "./constants";
import type { BookingInfo } from "./bookings";

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
  matchId: number | null;
  venueBookingId: number | null;
  sourceType: string;
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
  sourceDetail: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  checklist: ChecklistItem[];
  comments: TaskComment[];
  booking: BookingInfo | null;
}
