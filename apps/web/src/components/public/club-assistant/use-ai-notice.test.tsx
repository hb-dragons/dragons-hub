// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { AI_NOTICE_KEY } from "./ai-notice";
import { useAiNotice } from "./use-ai-notice";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Probe() {
  return <span>{useAiNotice().state}</span>;
}

describe("useAiNotice", () => {
  it("renders pending on the server so hydration cannot mismatch the stored flag", () => {
    expect(renderToString(<Probe />)).toContain("pending");
  });

  it("shows the notice in a fresh browser", () => {
    const { result } = renderHook(() => useAiNotice());
    expect(result.current.state).toBe("show");
  });

  it("hides the notice when the flag was acknowledged earlier", () => {
    window.localStorage.setItem(AI_NOTICE_KEY, "1");
    const { result } = renderHook(() => useAiNotice());
    expect(result.current.state).toBe("hidden");
  });

  it("hides the notice and persists the acknowledgement", () => {
    const { result } = renderHook(() => useAiNotice());
    act(() => result.current.acknowledge());
    expect(result.current.state).toBe("hidden");
    expect(window.localStorage.getItem(AI_NOTICE_KEY)).toBe("1");
  });

  it("hides the notice for the session even when storage rejects the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useAiNotice());
    act(() => result.current.acknowledge());
    expect(result.current.state).toBe("hidden");
  });

  it("follows an acknowledgement made in another tab", () => {
    const { result } = renderHook(() => useAiNotice());
    expect(result.current.state).toBe("show");
    act(() => {
      window.localStorage.setItem(AI_NOTICE_KEY, "1");
      window.dispatchEvent(new StorageEvent("storage", { key: AI_NOTICE_KEY }));
    });
    expect(result.current.state).toBe("hidden");
  });
});
