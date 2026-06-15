import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ tool: (d: unknown) => d }));

// --- Imports (after mocks) ---
import { z } from "zod";
import { defineTool, toAiSdkTools } from "./tool-kit";

describe("defineTool", () => {
  it("parses input with the schema before running", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const t = defineTool("echo", "desc", z.object({ n: z.number() }), run);
    await t.execute({ n: 3 });
    expect(run).toHaveBeenCalledWith({ n: 3 });
  });

  it("throws on input that fails the schema", async () => {
    const t = defineTool("echo", "desc", z.object({ n: z.number() }), vi.fn());
    await expect(t.execute({ n: "x" })).rejects.toThrow();
  });
});

describe("toAiSdkTools", () => {
  it("maps a tool array into a record keyed by name", () => {
    const t = defineTool("echo", "desc", z.object({}), vi.fn());
    const out = toAiSdkTools([t]) as Record<string, { description: string }>;
    expect(Object.keys(out)).toEqual(["echo"]);
    expect(out.echo!.description).toBe("desc");
  });
});
