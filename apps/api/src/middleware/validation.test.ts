import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { validator } from "hono-openapi";
import { z } from "zod";
import type { ZodTypeAny } from "zod";
import type { Context } from "hono";
import { validationHook } from "./validation";

const schema = z.object({ name: z.string().min(1) });
const nestedSchema = z.object({ user: z.object({ name: z.string().min(1) }) });

function makeApp(s: ZodTypeAny = schema) {
  const app = new Hono();
  app.post(
    "/t",
    validator("json", s, validationHook),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe("validationHook", () => {
  it("returns the central {error, code, details} envelope on invalid body", async () => {
    const res = await makeApp().request("/t", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Invalid request data");
    expect(Array.isArray(json.details)).toBe(true);
    // path must be the dot-joined field name, not just present
    expect(json.details[0].path).toBe("name");
    // message must be the real zod string (min(1) violation contains "1")
    expect(json.details[0].message).toMatch(/1/);
  });

  it("joins nested paths with dots", async () => {
    const res = await makeApp(nestedSchema).request("/t", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: { name: "" } }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    // dot-join must produce "user.name", not "user,name" or "[user][name]"
    expect(json.details[0].path).toBe("user.name");
    expect(json.details[0].message).toMatch(/1/);
  });

  it("passes a valid body through to the handler", async () => {
    const res = await makeApp().request("/t", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ok" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("formats object-style path segments and missing paths", () => {
    let captured: { body: unknown; status: unknown } | undefined;
    const c = {
      json: (body: unknown, status: unknown) => {
        captured = { body, status };
        return body;
      },
    } as unknown as Context;
    validationHook(
      {
        success: false,
        data: undefined,
        error: [
          { message: "nested bad", path: [{ key: "user" }, { key: "name" }] },
          { message: "no path" },
        ],
      } as unknown as Parameters<typeof validationHook>[0],
      c,
    );
    if (!captured) throw new Error("validationHook did not call c.json");
    const body = captured.body as { details: Array<{ path: string; message: string }> };
    expect(captured.status).toBe(400);
    const details = body.details;
    expect(details.at(0)?.path).toBe("user.name");
    expect(details.at(1)?.path).toBe("");
  });
});
