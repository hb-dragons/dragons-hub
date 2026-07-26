import { describe, expect, it } from "vitest";
import { resolveFetchState } from "./fetch-state";

describe("resolveFetchState", () => {
  it("is loading while the first request is in flight", () => {
    expect(resolveFetchState({ isLoading: true, error: undefined, data: undefined })).toBe(
      "loading",
    );
  });

  it("is error when the request failed", () => {
    expect(
      resolveFetchState({ isLoading: false, error: new Error("offline"), data: undefined }),
    ).toBe("error");
  });

  it("is error — NOT loading — once a request has settled without data", () => {
    // This is the bug: SWR flips `isLoading` to false on failure while `data`
    // stays undefined, so `isLoading || !data` rendered a spinner forever with
    // no retry. A settled request with nothing to show is an error state.
    expect(resolveFetchState({ isLoading: false, error: undefined, data: undefined })).toBe(
      "error",
    );
  });

  it("keeps showing data through a background revalidation error (stale-while-revalidate)", () => {
    expect(
      resolveFetchState({ isLoading: false, error: new Error("offline"), data: { a: 1 } }),
    ).toBe("ready");
  });

  it("prefers cached data over the loading flag", () => {
    expect(resolveFetchState({ isLoading: true, error: undefined, data: { a: 1 } })).toBe(
      "ready",
    );
  });

  it("treats an empty list or a zero as data, not as absence", () => {
    expect(resolveFetchState({ isLoading: false, error: undefined, data: [] })).toBe("ready");
    expect(resolveFetchState({ isLoading: false, error: undefined, data: 0 })).toBe("ready");
    expect(resolveFetchState({ isLoading: false, error: undefined, data: "" })).toBe("ready");
  });

  it("treats null the same as undefined", () => {
    expect(resolveFetchState({ isLoading: false, error: undefined, data: null })).toBe("error");
  });
});
