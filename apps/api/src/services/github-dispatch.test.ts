import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { postRepositoryDispatch } from "./github-dispatch";

const fetchMock = vi.fn();

const dispatch = {
  owner: "hb-dragons",
  repo: "dragons-hub",
  token: "ghp_test",
  eventType: "hub-content-change",
  clientPayload: { reason: "team staff created" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postRepositoryDispatch", () => {
  it("posts the dispatch to the repo's endpoint with the headers GitHub needs", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await postRepositoryDispatch(dispatch)).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/hb-dragons/dragons-hub/dispatches");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer ghp_test",
      "Content-Type": "application/json",
      "User-Agent": "dragons-hub-api",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    expect(JSON.parse(init.body)).toEqual({
      event_type: "hub-content-change",
      client_payload: { reason: "team staff created" },
    });
  });

  it("bounds the request so a save never waits on GitHub indefinitely", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await postRepositoryDispatch(dispatch);

    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("reports the status and body of a refused dispatch", async () => {
    fetchMock.mockResolvedValue(new Response("Bad credentials", { status: 401 }));

    expect(await postRepositoryDispatch(dispatch)).toEqual({
      ok: false,
      status: 401,
      error: "Bad credentials",
    });
  });

  it("reports a request that never got an answer as status 0", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));

    expect(await postRepositoryDispatch(dispatch)).toEqual({
      ok: false,
      status: 0,
      error: "The operation was aborted due to timeout",
    });
  });

  it("survives a rejection that is not an Error", async () => {
    fetchMock.mockRejectedValue("nope");

    expect(await postRepositoryDispatch(dispatch)).toEqual({
      ok: false,
      status: 0,
      error: "Unknown error",
    });
  });
});
