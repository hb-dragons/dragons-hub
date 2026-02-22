import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { errorHandler } from "./error";

const app = new Hono();
app.onError(errorHandler);

app.get("/throw-error", () => {
  throw new Error("Something broke");
});

app.get("/throw-zod", () => {
  const schema = z.object({ name: z.string() });
  const result = schema.safeParse({ name: 42 });
  if (!result.success) throw result.error;
  return new Response("ok");
});

app.get("/throw-non-error", () => {
  throw new Error("Unknown error occurred");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("errorHandler", () => {
  it("returns 400 for ZodError", async () => {
    const res = await app.request("/throw-zod");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request data");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toHaveLength(1);
    expect(body.details[0].path).toBe("name");
  });

  it("returns 500 with message in non-production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something broke");
    expect(body.code).toBe("INTERNAL_ERROR");

    process.env.NODE_ENV = originalEnv;
  });

  it("returns generic message in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = await app.request("/throw-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");

    process.env.NODE_ENV = originalEnv;
  });

  it("handles Error instances with stack trace", async () => {
    const res = await app.request("/throw-non-error");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
