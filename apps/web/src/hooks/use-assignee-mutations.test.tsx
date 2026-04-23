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

import { useAssigneeMutations } from "./use-assignee-mutations";

describe("useAssigneeMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("addAssignee PUTs /admin/tasks/:id/assignees/:userId", async () => {
    mocks.fetchAPI.mockResolvedValue({ userId: "u_a", name: "Alice" });
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.addAssignee(5, "u_a");
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5/assignees/u_a",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("removeAssignee DELETEs /admin/tasks/:id/assignees/:userId", async () => {
    mocks.fetchAPI.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.removeAssignee(5, "u_a");
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5/assignees/u_a",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("encodes userId with special characters", async () => {
    mocks.fetchAPI.mockResolvedValue({ userId: "u with space", name: "X" });
    const { result } = renderHook(() => useAssigneeMutations(1));
    await act(async () => {
      await result.current.addAssignee(5, "u with space");
    });
    expect(mocks.fetchAPI).toHaveBeenCalledWith(
      "/admin/tasks/5/assignees/u%20with%20space",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
