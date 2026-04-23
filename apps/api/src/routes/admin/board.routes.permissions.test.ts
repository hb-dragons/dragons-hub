import { describe, expect, it, vi } from "vitest";

const captured: Array<{ resource: string; action: string }> = [];

vi.mock("../../middleware/rbac", () => ({
  requirePermission: vi.fn((resource: string, action: string) => {
    captured.push({ resource, action });
    return async (_c: unknown, next: () => Promise<void>) => next();
  }),
}));

vi.mock("../../services/admin/board.service", () => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  getBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  addColumn: vi.fn(),
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
  reorderColumns: vi.fn(),
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn() },
}));

await import("./board.routes");

describe("board.routes permission gates", () => {
  it("uses board resource with view, update, and delete actions", () => {
    const reads = captured.filter((c) => c.action === "view");
    const updates = captured.filter((c) => c.action === "update");
    const deletes = captured.filter((c) => c.action === "delete");

    expect(reads.length).toBeGreaterThan(0);
    expect(updates.length).toBeGreaterThan(0);
    expect(deletes.length).toBeGreaterThan(0);

    for (const c of [...reads, ...updates, ...deletes]) {
      expect(c.resource).toBe("board");
    }
  });
});
