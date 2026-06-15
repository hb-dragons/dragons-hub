import { describe, expect, it } from "vitest";
import { toolChip } from "./parts";

describe("toolChip", () => {
  it("maps a finished static tool part to done", () => {
    expect(toolChip({ type: "tool-get_standings", state: "output-available" })).toEqual({
      toolKey: "get_standings",
      status: "done",
    });
  });

  it("maps an in-progress static tool part to running", () => {
    expect(toolChip({ type: "tool-list_matches", state: "input-streaming" })).toEqual({
      toolKey: "list_matches",
      status: "running",
    });
    expect(toolChip({ type: "tool-list_matches", state: "input-available" })?.status).toBe("running");
  });

  it("maps an errored tool part to error", () => {
    expect(toolChip({ type: "tool-get_dashboard", state: "output-error" })).toEqual({
      toolKey: "get_dashboard",
      status: "error",
    });
  });

  it("reads the tool name from a dynamic-tool part", () => {
    expect(toolChip({ type: "dynamic-tool", toolName: "get_standings", state: "output-available" })).toEqual({
      toolKey: "get_standings",
      status: "done",
    });
  });

  it("returns null for non-tool parts", () => {
    expect(toolChip({ type: "text" })).toBeNull();
    expect(toolChip({ type: "step-start" })).toBeNull();
  });
});
