// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  addAssignee: vi.fn(),
  removeAssignee: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    boards: {
      addAssignee: mocks.addAssignee,
      removeAssignee: mocks.removeAssignee,
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

import { useAssigneeMutations } from "./use-assignee-mutations";

describe("useAssigneeMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("addAssignee calls api.boards.addAssignee(taskId, userId)", async () => {
    mocks.addAssignee.mockResolvedValue({ userId: "u_a", name: "Alice" });
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.addAssignee(5, "u_a");
    });
    expect(mocks.addAssignee).toHaveBeenCalledWith(5, "u_a");
  });

  it("removeAssignee calls api.boards.removeAssignee(taskId, userId)", async () => {
    mocks.removeAssignee.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.removeAssignee(5, "u_a");
    });
    expect(mocks.removeAssignee).toHaveBeenCalledWith(5, "u_a");
  });

  it("passes userId through to api.boards.addAssignee unchanged", async () => {
    mocks.addAssignee.mockResolvedValue({ userId: "u with space", name: "X" });
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.addAssignee(5, "u with space");
    });
    expect(mocks.addAssignee).toHaveBeenCalledWith(5, "u with space");
  });
});
