import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClient, BLOB_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "./client";
import { APIError } from "./errors";

const baseUrl = "https://api.example.com";

/** Resolves only when its signal aborts — a request that hangs. */
function hangingFetch() {
  return vi.fn<typeof fetch>((_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason ?? new Error("aborted"));
      });
    });
  });
}

function okFetch() {
  return vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({ ok: true }),
  } as Response);
}

describe("request deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a hanging request after the default deadline", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn });

    const pending = client.get("/slow");
    const assertion = expect(pending).rejects.toMatchObject({
      code: "TIMEOUT",
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await assertion;
    await expect(pending.catch((error) => error instanceof APIError)).resolves.toBe(true);
  });

  it("honours a per-call deadline", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn });

    const pending = client.get("/slow", undefined, { timeoutMs: 50 });
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("honours a client-wide deadline", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn, timeoutMs: 100 });

    const pending = client.get("/slow");
    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("runs without a deadline when it is disabled", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn, timeoutMs: 0 });

    const pending = client.get("/slow");
    const settled = vi.fn();
    void pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS * 4);

    expect(settled).not.toHaveBeenCalled();
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  it("still aborts on the caller's own signal, with the caller's reason", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn });
    const controller = new AbortController();

    const pending = client.get("/slow", undefined, { signal: controller.signal });
    const assertion = expect(pending).rejects.toThrow(/unmounted/);
    controller.abort(new Error("component unmounted"));
    await assertion;
  });

  it("gives a download the longer binary deadline", async () => {
    const fetchFn = hangingFetch();
    const client = new ApiClient({ baseUrl, fetchFn });

    const pending = client.getBlob("/export.csv");
    const settled = vi.fn();
    void pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(settled).not.toHaveBeenCalled();

    const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(BLOB_TIMEOUT_MS - DEFAULT_TIMEOUT_MS);
    await assertion;
  });

  it("clears the timer once a request resolves", async () => {
    const fetchFn = okFetch();
    const client = new ApiClient({ baseUrl, fetchFn });

    await expect(client.get("/fast")).resolves.toEqual({ ok: true });

    expect(vi.getTimerCount()).toBe(0);
  });
});
