import type {
  BoardSummary,
  BoardData,
  BoardColumnData,
  TaskCardData,
  TaskDetail,
  TaskAssignee,
  ChecklistItem,
  TaskComment,
  TaskPriority,
} from "@dragons/shared";
import type { ApiClient } from "../client";

export interface TaskListFilters {
  columnId?: number;
  assigneeId?: string;
  priority?: TaskPriority;
}

export interface CreateBoardBody {
  name: string;
  description?: string | null;
}

export interface UpdateBoardBody {
  name?: string;
  description?: string | null;
}

export interface AddColumnBody {
  name: string;
  color?: string | null;
  isDoneColumn?: boolean;
}

export interface UpdateColumnBody {
  name?: string;
  color?: string | null;
  isDoneColumn?: boolean;
}

export interface CreateTaskBody {
  columnId: number;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface MoveTaskBody {
  columnId: number;
  position: number;
}

export function adminBoardEndpoints(client: ApiClient) {
  return {
    // Boards
    listBoards(): Promise<BoardSummary[]> {
      return client.get("/admin/boards");
    },
    getBoard(id: number): Promise<BoardData> {
      return client.get(`/admin/boards/${id}`);
    },
    createBoard(body: CreateBoardBody): Promise<BoardData> {
      return client.post("/admin/boards", body);
    },
    updateBoard(id: number, body: UpdateBoardBody): Promise<BoardData> {
      return client.patch(`/admin/boards/${id}`, body);
    },
    deleteBoard(id: number): Promise<void> {
      return client.delete(`/admin/boards/${id}`);
    },

    // Columns
    addColumn(boardId: number, body: AddColumnBody): Promise<BoardColumnData> {
      return client.post(`/admin/boards/${boardId}/columns`, body);
    },
    updateColumn(
      boardId: number,
      colId: number,
      body: UpdateColumnBody,
    ): Promise<BoardColumnData> {
      return client.patch(`/admin/boards/${boardId}/columns/${colId}`, body);
    },
    deleteColumn(boardId: number, colId: number): Promise<void> {
      return client.delete(`/admin/boards/${boardId}/columns/${colId}`);
    },
    reorderColumns(
      boardId: number,
      order: { id: number; position: number }[],
    ): Promise<void> {
      return client.patch(`/admin/boards/${boardId}/columns/reorder`, {
        order,
      });
    },

    // Tasks
    listTasks(
      boardId: number,
      filters?: TaskListFilters,
    ): Promise<TaskCardData[]> {
      return client.get(
        `/admin/boards/${boardId}/tasks`,
        filters as Record<string, string | number | boolean | undefined>,
      );
    },
    createTask(boardId: number, body: CreateTaskBody): Promise<TaskCardData> {
      return client.post(`/admin/boards/${boardId}/tasks`, body);
    },
    getTask(id: number): Promise<TaskDetail> {
      return client.get(`/admin/tasks/${id}`);
    },
    updateTask(id: number, body: UpdateTaskBody): Promise<TaskDetail> {
      return client.patch(`/admin/tasks/${id}`, body);
    },
    moveTask(id: number, body: MoveTaskBody): Promise<TaskDetail> {
      return client.patch(`/admin/tasks/${id}/move`, body);
    },
    deleteTask(id: number): Promise<void> {
      return client.delete(`/admin/tasks/${id}`);
    },

    // Checklist
    addChecklistItem(taskId: number, label: string): Promise<ChecklistItem> {
      return client.post(`/admin/tasks/${taskId}/checklist`, { label });
    },
    updateChecklistItem(
      taskId: number,
      itemId: number,
      body: { label?: string; isChecked?: boolean },
    ): Promise<ChecklistItem> {
      return client.patch(
        `/admin/tasks/${taskId}/checklist/${itemId}`,
        body,
      );
    },
    deleteChecklistItem(taskId: number, itemId: number): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/checklist/${itemId}`);
    },

    // Comments
    addComment(taskId: number, body: string): Promise<TaskComment> {
      return client.post(`/admin/tasks/${taskId}/comments`, { body });
    },
    updateComment(
      taskId: number,
      commentId: number,
      body: string,
    ): Promise<TaskComment> {
      return client.patch(`/admin/tasks/${taskId}/comments/${commentId}`, {
        body,
      });
    },
    deleteComment(taskId: number, commentId: number): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/comments/${commentId}`);
    },

    // Assignees
    addAssignee(taskId: number, userId: string): Promise<TaskAssignee> {
      return client.post(`/admin/tasks/${taskId}/assignees/${userId}`, {});
    },
    removeAssignee(taskId: number, userId: string): Promise<void> {
      return client.delete(`/admin/tasks/${taskId}/assignees/${userId}`);
    },
  };
}
