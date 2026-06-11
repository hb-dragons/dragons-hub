import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./client";
import type { AuthStrategy } from "./client";
import { APIError } from "./errors";

function mockFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as Response);
}

describe("ApiClient", () => {
  const baseUrl = "https://api.example.com";

  it("makes GET requests with correct URL and method", async () => {
    const fetchFn = mockFetch(200, { data: "test" });
    const client = new ApiClient({ baseUrl, fetchFn });

    await client.get("/items", { page: 1, limit: 10 });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/items?page=1&limit=10",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("makes GET requests without params", async () => {
    const fetchFn = mockFetch(200, []);
    const client = new ApiClient({ baseUrl, fetchFn });

    await client.get("/items");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("makes POST requests with body serialized as JSON", async () => {
    const fetchFn = mockFetch(200, { id: 1 });
    const client = new ApiClient({ baseUrl, fetchFn });
    const body = { name: "test", value: 42 };

    await client.post("/items", body);

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("includes auth headers when strategy provided", async () => {
    const fetchFn = mockFetch(200, {});
    const auth: AuthStrategy = {
      getHeaders: () => ({ Authorization: "Bearer token123" }),
    };
    const client = new ApiClient({ baseUrl, auth, fetchFn });

    await client.get("/protected");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/protected",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
      }),
    );
  });

  it("handles async auth strategies", async () => {
    const fetchFn = mockFetch(200, {});
    const auth: AuthStrategy = {
      getHeaders: async () => ({ Authorization: "Bearer async-token" }),
    };
    const client = new ApiClient({ baseUrl, auth, fetchFn });

    await client.get("/protected");

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer async-token",
        }),
      }),
    );
  });

  it("throws APIError on non-ok responses with correct status/code/message", async () => {
    const fetchFn = mockFetch(404, {
      code: "NOT_FOUND",
      message: "Item not found",
    });
    const client = new ApiClient({ baseUrl, fetchFn });

    const error = await client.get("/missing").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(APIError);
    const apiError = error as APIError;
    expect(apiError.status).toBe(404);
    expect(apiError.code).toBe("NOT_FOUND");
    expect(apiError.message).toBe("Item not found");
  });

  it("throws APIError with defaults when error body is not JSON", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);
    const client = new ApiClient({ baseUrl, fetchFn });

    const error = await client.get("/broken").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(APIError);
    const apiError = error as APIError;
    expect(apiError.status).toBe(500);
    expect(apiError.code).toBe("UNKNOWN_ERROR");
    expect(apiError.message).toBe("Internal Server Error");
  });

  it("works without auth strategy (no auth headers)", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({ baseUrl, fetchFn });

    await client.get("/public");

    const calledHeaders = fetchFn.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(calledHeaders["Authorization"]).toBeUndefined();
    expect(calledHeaders["Content-Type"]).toBe("application/json");
    expect(calledHeaders["Accept"]).toBe("application/json");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({ baseUrl: "https://api.example.com///", fetchFn });

    await client.get("/items");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.anything(),
    );
  });

  it("passes credentials option to fetch when set", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({ baseUrl, fetchFn, credentials: "include" });

    await client.get("/items");

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("omits credentials from fetch when not set", async () => {
    const fetchFn = mockFetch(200, {});
    const client = new ApiClient({ baseUrl, fetchFn });

    await client.get("/items");

    const callOptions = fetchFn.mock.calls[0]![1]!;
    expect(callOptions).not.toHaveProperty("credentials");
  });

  it("invokes onResponse for every response", async () => {
    const seen: number[] = [];
    const mockFetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetchFn as unknown as typeof fetch,
      onResponse: (res) => {
        seen.push(res.status);
      },
    });

    await client.get("/ping");

    expect(seen).toEqual([200]);
  });

  it("invokes onResponse even on error responses", async () => {
    const seen: number[] = [];
    const mockFetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "no" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetchFn as unknown as typeof fetch,
      onResponse: (res) => {
        seen.push(res.status);
      },
    });

    await expect(client.get("/ping")).rejects.toThrow();
    expect(seen).toEqual([401]);
  });

  it("awaits async onResponse before returning", async () => {
    const events: string[] = [];
    const mockFetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetchFn as unknown as typeof fetch,
      onResponse: async () => {
        await new Promise((r) => setTimeout(r, 5));
        events.push("hook");
      },
    });

    await client.get("/ping");
    events.push("after-get");
    expect(events).toEqual(["hook", "after-get"]);
  });
});

function clientReturning(status: number, body: unknown) {
  const fetchFn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new ApiClient({ baseUrl: "https://x.test", fetchFn: fetchFn as unknown as typeof fetch });
}

describe("ApiClient error parsing", () => {
  it("uses the API's { error, code } envelope for the thrown APIError", async () => {
    const client = clientReturning(400, { error: "Invalid request data", code: "VALIDATION_ERROR", details: [] });
    await expect(client.get("/x")).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: "Invalid request data" });
  });

  it("falls back to message, then statusText", async () => {
    const a = clientReturning(500, { message: "boom" });
    await expect(a.get("/x")).rejects.toMatchObject({ message: "boom" });
    const b = clientReturning(503, {});
    await expect(b.get("/x")).rejects.toBeInstanceOf(APIError);
  });
});

describe("ApiClient cache option", () => {
  it("passes a configured cache mode to fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new ApiClient({ baseUrl: "https://x.test", cache: "no-store", fetchFn });
    await client.get("/x");
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});

describe("ApiClient AbortSignal support", () => {
  it("passes an AbortSignal to fetch when provided to get", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new ApiClient({ baseUrl: "https://x.test", fetchFn });
    const controller = new AbortController();
    await client.get("/x", undefined, { signal: controller.signal });
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
  });

  it("does not set signal when none provided", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new ApiClient({ baseUrl: "https://x.test", fetchFn });
    await client.get("/x");
    expect(fetchFn.mock.calls[0]![1]?.signal).toBeUndefined();
  });
});

describe("ApiClient.postForm (multipart)", () => {
  const baseUrl = "https://api.example.com";

  it("sends the FormData body verbatim without forcing a JSON Content-Type", async () => {
    const fetchFn = mockFetch(200, { id: 7 });
    const client = new ApiClient({ baseUrl, fetchFn });
    const form = new FormData();
    form.append("file", new Blob(["x"]), "x.png");

    const result = await client.postForm<{ id: number }>("/uploads", form);

    expect(result).toEqual({ id: 7 });
    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(form);
    // Must NOT set Content-Type — fetch derives the multipart boundary itself.
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("still applies auth headers to multipart uploads", async () => {
    const fetchFn = mockFetch(200, {});
    const auth: AuthStrategy = { getHeaders: () => ({ Authorization: "Bearer t" }) };
    const client = new ApiClient({ baseUrl, fetchFn, auth });
    await client.postForm("/uploads", new FormData());
    const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer t");
  });

  it("throws APIError on a non-ok multipart response", async () => {
    const fetchFn = mockFetch(413, { error: "Too large", code: "PAYLOAD_TOO_LARGE" });
    const client = new ApiClient({ baseUrl, fetchFn });
    await expect(client.postForm("/uploads", new FormData())).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "Too large",
    });
  });
});

describe("ApiClient.postBlob (binary response)", () => {
  const baseUrl = "https://api.example.com";

  function mockBlobFetch(status: number, blob: Blob) {
    return vi.fn<typeof fetch>().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      blob: () => Promise.resolve(blob),
      json: () => Promise.resolve({}),
    } as Response);
  }

  it("POSTs a JSON body and resolves the binary response as a Blob", async () => {
    const png = new Blob(["fake-png"], { type: "image/png" });
    const fetchFn = mockBlobFetch(200, png);
    const client = new ApiClient({ baseUrl, fetchFn });
    const body = { type: "lineup" };

    const result = await client.postBlob("/social/generate", body);

    expect(result).toBe(png);
    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(body));
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws APIError (parsing the JSON error envelope) on a non-ok response", async () => {
    const fetchFn = mockFetch(422, { error: "Bad input", code: "VALIDATION_ERROR" });
    const client = new ApiClient({ baseUrl, fetchFn });
    await expect(client.postBlob("/social/generate", {})).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });
  });
});
