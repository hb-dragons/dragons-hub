// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  deleteTask: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    boards: {
      createTask: mocks.createTask,
      updateTask: mocks.updateTask,
      moveTask: mocks.moveTask,
      deleteTask: mocks.deleteTask,
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

import { useTaskMutations } from "./use-task-mutations";

describe("useTaskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask calls api.boards.createTask(boardId, input)", async () => {
    mocks.createTask.mockResolvedValue({ id: 1, title: "T" });
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.createTask({ title: "T", columnId: 10 });
    });
    expect(mocks.createTask).toHaveBeenCalledWith(1, {
      title: "T",
      columnId: 10,
    });
  });

  it("moveTask calls api.boards.moveTask with body", async () => {
    mocks.moveTask.mockResolvedValue({});
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.moveTask(5, 20, 3);
    });
    expect(mocks.moveTask).toHaveBeenCalledWith(5, {
      columnId: 20,
      position: 3,
    });
  });

  it("deleteTask calls api.boards.deleteTask(id)", async () => {
    mocks.deleteTask.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.deleteTask(5);
    });
    expect(mocks.deleteTask).toHaveBeenCalledWith(5);
  });

  it("updateTask calls api.boards.updateTask(id, input)", async () => {
    mocks.updateTask.mockResolvedValue({ id: 5, title: "updated" });
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.updateTask(5, { title: "updated" });
    });
    expect(mocks.updateTask).toHaveBeenCalledWith(5, { title: "updated" });
  });
});
