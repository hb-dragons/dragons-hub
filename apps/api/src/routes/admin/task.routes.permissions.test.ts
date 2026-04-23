import { describe, expect, it, vi } from "vitest";

const captured: Array<{ resource: string; action: string }> = [];

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn((resource: string, action: string) => {
    captured.push({ resource, action });
    return async (_c: unknown, next: () => Promise<void>) => next();
  }),
}));

vi.mock("../../services/admin/task.service", () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  getTaskDetail: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  deleteTask: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  addComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  addAssignee: vi.fn(),
  removeAssignee: vi.fn(),
}));

await import("./task.routes");

describe("task.routes permission gates", () => {
  it("uses board resource for every gate", () => {
    expect(captured.length).toBeGreaterThan(0);
    for (const c of captured) {
      expect(c.resource).toBe("board");
    }
  });

  it("read uses view, mutation uses update", () => {
    const reads = captured.filter((c) => c.action === "view");
    const updates = captured.filter((c) => c.action === "update");
    expect(reads.length).toBeGreaterThan(0);
    expect(updates.length).toBeGreaterThan(0);
  });
});
