export interface BoardColumnData {
  id: number;
  name: string;
  position: number;
  color: string | null;
  isDoneColumn: boolean;
}

export interface BoardSummary {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface BoardData {
  id: number;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumnData[];
}
