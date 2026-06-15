import { describe, expect, it } from "vitest";
import { toolChip } from "./tool-parts";

describe("toolChip", () => {
  it("maps a finished static tool part to done", () => {
    expect(toolChip({ type: "tool-get_standings", state: "output-available" })).toEqual({ toolKey: "get_standings", status: "done" });
  });
  it("maps in-progress states to running", () => {
    expect(toolChip({ type: "tool-list_matches", state: "input-streaming" })?.status).toBe("running");
    expect(toolChip({ type: "tool-list_matches", state: "input-available" })?.status).toBe("running");
  });
  it("maps output-error to error", () => {
    expect(toolChip({ type: "tool-get_dashboard", state: "output-error" })).toEqual({ toolKey: "get_dashboard", status: "error" });
  });
  it("reads dynamic-tool name", () => {
    expect(toolChip({ type: "dynamic-tool", toolName: "get_standings", state: "output-available" })).toEqual({ toolKey: "get_standings", status: "done" });
  });
  it("returns null for non-tool parts", () => {
    expect(toolChip({ type: "text" })).toBeNull();
  });
});
