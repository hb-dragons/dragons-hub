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
});
