// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ fetchAPI: mocks.fetchAPI }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

import { useTaskMutations } from "./use-task-mutations";

describe("useTaskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask posts to /admin/boards/:id/tasks", async () => {
    mocks.fetchAPI.mockResolvedValue({ id: 1, title: "T" });
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.createTask({ title: "T", columnId: 10 });
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/boards/1/tasks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("moveTask calls PATCH /admin/tasks/:id/move", async () => {
    mocks.fetchAPI.mockResolvedValue({});
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.moveTask(5, 20, 3);
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5/move",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ columnId: 20, position: 3 }),
      }),
    );
  });

  it("deleteTask calls DELETE /admin/tasks/:id", async () => {
    mocks.fetchAPI.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.deleteTask(5);
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("updateTask calls PATCH /admin/tasks/:id", async () => {
    mocks.fetchAPI.mockResolvedValue({ id: 5, title: "updated" });
    const { result } = renderHook(() => useTaskMutations(1));
    await act(async () => {
      await result.current.updateTask(5, { title: "updated" });
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "updated" }),
      }),
    );
  });
});
