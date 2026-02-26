export interface BoardColumnData {
  id: number;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
}

export interface TaskCardData {
  id: number;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: string;
  dueDate: string | null;
  position: number;
  columnId: number;
  matchId: number | null;
  venueBookingId: number | null;
  sourceType: string;
  checklistTotal: number;
  checklistChecked: number;
}

export interface BoardData {
  id: number;
  name: string;
  columns: BoardColumnData[];
}
