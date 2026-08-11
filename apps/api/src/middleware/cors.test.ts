import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "./cors";
import { env } from "../config/env";

const ORIGIN = env.TRUSTED_ORIGINS[0]!;

function appWithCors() {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.get("/download.csv", (c) =>
    c.body("a,b\n", 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "X-Total-Count": "2500",
      "X-Result-Truncated": "true",
    }),
  );
  return app;
}

describe("corsMiddleware", () => {
  it("is defined", () => {
    expect(corsMiddleware).toBeDefined();
  });

  it("is a middleware function", () => {
    expect(typeof corsMiddleware).toBe("function");
  });

  it("allows Last-Event-ID header for SSE reconnect", async () => {
    const res = await appWithCors().request("/download.csv", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Last-Event-ID",
      },
    });
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Last-Event-ID",
    );
  });

  it("exposes the CSV truncation headers to cross-origin browser code", async () => {
    // Without Access-Control-Expose-Headers the browser hides every non-safelisted
    // response header, so the documented X-Total-Count / X-Result-Truncated
    // contract is unreadable from the web app's fetch().
    const res = await appWithCors().request("/download.csv", {
      headers: { Origin: ORIGIN },
    });
    const exposed = (res.headers.get("Access-Control-Expose-Headers") ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase());
    expect(exposed).toContain("x-total-count");
    expect(exposed).toContain("x-result-truncated");
  });
});
