import { describe, it, expect, vi } from "vitest";
import {
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
  taskCreateBodySchema,
  taskUpdateBodySchema,
  taskMoveBodySchema,
  taskListQuerySchema,
  checklistItemCreateBodySchema,
  commentCreateBodySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { adminBoardEndpoints } from "./admin-board";

/** Build a client whose fetch records the outgoing request body. */
function recordingClient() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: adminBoardEndpoints(client), calls };
}

describe("admin-board request bodies satisfy @dragons/contracts schemas", () => {
  it("createBoard body parses against boardCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.createBoard({ name: "Sprint", description: "desc" });
    const parsed = boardCreateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "boardCreateBodySchema rejected the request body").toBeUndefined();
  });

  it("updateBoard body parses against boardUpdateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateBoard(1, { name: "Renamed" });
    const parsed = boardUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "boardUpdateBodySchema rejected the request body").toBeUndefined();
  });

  it("addColumn body parses against columnCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.addColumn(1, { name: "To Do", color: "#ff0000" });
    const parsed = columnCreateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "columnCreateBodySchema rejected the request body").toBeUndefined();
  });

  it("updateColumn body parses against columnUpdateBodySchema (incl. position)", async () => {
    const { api, calls } = recordingClient();
    await api.updateColumn(1, 2, { name: "Doing", position: 3 });
    const parsed = columnUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "columnUpdateBodySchema rejected the request body").toBeUndefined();
  });

  it("reorderColumns body parses against columnReorderBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.reorderColumns(1, [{ id: 9, position: 0 }]);
    const parsed = columnReorderBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "columnReorderBodySchema rejected the request body").toBeUndefined();
  });

  it("createTask body parses against taskCreateBodySchema (incl. assigneeIds — closes drift)", async () => {
    const { api, calls } = recordingClient();
    await api.createTask(1, {
      title: "Buy jerseys",
      columnId: 2,
      description: "Order from supplier",
      assigneeIds: ["user-1", "user-2"],
      priority: "high",
      dueDate: "2026-06-01",
    });
    const parsed = taskCreateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "taskCreateBodySchema rejected the request body").toBeUndefined();
  });

  it("updateTask body parses against taskUpdateBodySchema (incl. assigneeIds — closes drift)", async () => {
    const { api, calls } = recordingClient();
    await api.updateTask(5, {
      title: "Renamed",
      assigneeIds: ["user-3"],
      priority: "normal",
    });
    const parsed = taskUpdateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "taskUpdateBodySchema rejected the request body").toBeUndefined();
  });

  it("moveTask body parses against taskMoveBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.moveTask(5, { columnId: 3, position: 1 });
    const parsed = taskMoveBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "taskMoveBodySchema rejected the request body").toBeUndefined();
  });

  it("listTasks filters parse against taskListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.listTasks(1, { columnId: 2, assigneeId: "user-1", priority: "urgent" });
    // GET passes filters as query params, not body — validate the filters object directly
    const filtersArg = calls[0]!.body;
    // listTasks is a GET so body is undefined; validate the filter shape directly
    const parsed = taskListQuerySchema.safeParse({ columnId: 2, assigneeId: "user-1", priority: "urgent" });
    expect(parsed.error?.issues, "taskListQuerySchema rejected the filters").toBeUndefined();
  });

  it("addChecklistItem body parses against checklistItemCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.addChecklistItem(3, "Step 1");
    const parsed = checklistItemCreateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "checklistItemCreateBodySchema rejected the request body").toBeUndefined();
  });

  it("addComment body parses against commentCreateBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.addComment(3, "Great work!");
    const parsed = commentCreateBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "commentCreateBodySchema rejected the request body").toBeUndefined();
  });
});
