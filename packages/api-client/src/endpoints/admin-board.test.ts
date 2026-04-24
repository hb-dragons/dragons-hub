import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { adminBoardEndpoints } from "./admin-board";

function makeClient(data: unknown, status = 200) {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: mockFetch as unknown as typeof fetch,
  });
  return { client, mockFetch };
}

describe("adminBoardEndpoints", () => {
  // ── Boards ──────────────────────────────────────────────────────────────

  it("GETs /admin/boards for listBoards", async () => {
    const boards = [{ id: 1, name: "Sprint", description: null, createdAt: "2025-01-01" }];
    const { client, mockFetch } = makeClient(boards);
    const api = adminBoardEndpoints(client);

    const result = await api.listBoards();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards");
    expect((init as RequestInit).method).toBe("GET");
    expect(result).toEqual(boards);
  });

  it("GETs /admin/boards/:id for getBoard", async () => {
    const board = { id: 7, name: "Backlog", description: "desc", columns: [] };
    const { client, mockFetch } = makeClient(board);
    const api = adminBoardEndpoints(client);

    const result = await api.getBoard(7);

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.test/admin/boards/7");
    expect(result.id).toBe(7);
  });

  it("POSTs /admin/boards with name + description for createBoard", async () => {
    const created = { id: 2, name: "New Board", description: "hi", columns: [] };
    const { client, mockFetch } = makeClient(created);
    const api = adminBoardEndpoints(client);

    const result = await api.createBoard({ name: "New Board", description: "hi" });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: "New Board",
      description: "hi",
    });
    expect(result.id).toBe(2);
  });

  it("PATCHes /admin/boards/:id for updateBoard", async () => {
    const updated = { id: 3, name: "Renamed", description: null, columns: [] };
    const { client, mockFetch } = makeClient(updated);
    const api = adminBoardEndpoints(client);

    await api.updateBoard(3, { name: "Renamed" });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards/3");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: "Renamed" });
  });

  it("DELETEs /admin/boards/:id for deleteBoard", async () => {
    const { client, mockFetch } = makeClient({});
    const api = adminBoardEndpoints(client);

    await api.deleteBoard(5);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards/5");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  // ── Columns ─────────────────────────────────────────────────────────────

  it("PATCHes /admin/boards/:id/columns/reorder with { order } body", async () => {
    const { client, mockFetch } = makeClient({});
    const api = adminBoardEndpoints(client);
    const order = [{ id: 1, position: 0 }, { id: 2, position: 1 }];

    await api.reorderColumns(10, order);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards/10/columns/reorder");
    expect((init as RequestInit).method).toBe("PATCH");
    // Must wrap in { order: [...] }, not send raw array
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order });
  });

  it("POSTs /admin/boards/:id/columns for addColumn", async () => {
    const col = { id: 11, name: "Done", position: 2, color: "#0f0", isDoneColumn: true };
    const { client, mockFetch } = makeClient(col);
    const api = adminBoardEndpoints(client);

    const result = await api.addColumn(10, { name: "Done", color: "#0f0", isDoneColumn: true });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards/10/columns");
    expect((init as RequestInit).method).toBe("POST");
    expect(result.id).toBe(11);
  });

  // ── Tasks ────────────────────────────────────────────────────────────────

  it("GETs /admin/boards/:boardId/tasks with filters for listTasks", async () => {
    const { client, mockFetch } = makeClient([]);
    const api = adminBoardEndpoints(client);

    await api.listTasks(4, { columnId: 2, priority: "high" });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/admin/boards/4/tasks?");
    expect(url).toContain("columnId=2");
    expect(url).toContain("priority=high");
  });

  it("POSTs /admin/boards/:boardId/tasks for createTask", async () => {
    const task = { id: 99, title: "Fix bug", boardId: 4, columnId: 2 };
    const { client, mockFetch } = makeClient(task);
    const api = adminBoardEndpoints(client);

    const result = await api.createTask(4, {
      columnId: 2,
      title: "Fix bug",
      priority: "urgent",
    });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/boards/4/tasks");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.columnId).toBe(2);
    expect(body.priority).toBe("urgent");
    expect(result.id).toBe(99);
  });

  it("PATCHes /admin/tasks/:id/move with columnId + position for moveTask", async () => {
    const detail = { id: 99, columnId: 3, position: 0 };
    const { client, mockFetch } = makeClient(detail);
    const api = adminBoardEndpoints(client);

    await api.moveTask(99, { columnId: 3, position: 0 });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/move");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      columnId: 3,
      position: 0,
    });
  });

  it("DELETEs /admin/tasks/:id for deleteTask", async () => {
    const { client, mockFetch } = makeClient({});
    const api = adminBoardEndpoints(client);

    await api.deleteTask(88);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/88");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  // ── Checklist ────────────────────────────────────────────────────────────

  it("POSTs /admin/tasks/:id/checklist with { label } for addChecklistItem", async () => {
    const item = { id: 5, label: "Write tests", isChecked: false };
    const { client, mockFetch } = makeClient(item);
    const api = adminBoardEndpoints(client);

    const result = await api.addChecklistItem(99, "Write tests");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/checklist");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ label: "Write tests" });
    expect(result.id).toBe(5);
  });

  // ── Comments ─────────────────────────────────────────────────────────────

  it("POSTs /admin/tasks/:id/comments with { body } for addComment", async () => {
    const comment = { id: 7, authorId: "u1", body: "LGTM", createdAt: "2025-01-01", updatedAt: "2025-01-01" };
    const { client, mockFetch } = makeClient(comment);
    const api = adminBoardEndpoints(client);

    const result = await api.addComment(99, "LGTM");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/comments");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: "LGTM" });
    expect(result.id).toBe(7);
  });

  it("PATCHes /admin/tasks/:id/comments/:commentId with { body } for updateComment", async () => {
    const comment = { id: 7, authorId: "u1", body: "Updated", createdAt: "2025-01-01", updatedAt: "2025-01-02" };
    const { client, mockFetch } = makeClient(comment);
    const api = adminBoardEndpoints(client);

    await api.updateComment(99, 7, "Updated");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/comments/7");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: "Updated" });
  });

  // ── Assignees ─────────────────────────────────────────────────────────────

  it("POSTs /admin/tasks/:id/assignees/:userId with empty body for addAssignee", async () => {
    const assignee = { userId: "u42", name: "Alice", assignedAt: "2025-01-01" };
    const { client, mockFetch } = makeClient(assignee);
    const api = adminBoardEndpoints(client);

    const result = await api.addAssignee(99, "u42");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/assignees/u42");
    expect((init as RequestInit).method).toBe("POST");
    // Body must be {} not omitted
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({});
    expect(result.userId).toBe("u42");
  });

  it("DELETEs /admin/tasks/:id/assignees/:userId for removeAssignee", async () => {
    const { client, mockFetch } = makeClient({});
    const api = adminBoardEndpoints(client);

    await api.removeAssignee(99, "u42");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.test/admin/tasks/99/assignees/u42");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});
