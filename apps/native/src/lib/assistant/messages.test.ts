import { describe, expect, it } from "vitest";
import { messageText, messageSegments } from "./messages";

describe("messageText", () => {
  it("concatenates text parts and ignores non-text parts", () => {
    const msg = { id: "1", role: "assistant", parts: [
      { type: "text", text: "Hello " },
      { type: "tool-call", text: "ignored" },
      { type: "text", text: "world" },
    ] };
    expect(messageText(msg)).toBe("Hello world");
  });

  it("returns an empty string when there are no text parts", () => {
    expect(messageText({ id: "1", role: "user", parts: [] })).toBe("");
  });
});

describe("messageSegments", () => {
  it("returns ordered text/tool segments and merges consecutive text", () => {
    const msg = { id: "1", role: "assistant", parts: [
      { type: "text", text: "Let me check. " },
      { type: "text", text: "One sec." },
      { type: "tool-get_standings", state: "output-available" },
      { type: "text", text: "You're 3rd." },
    ] };
    expect(messageSegments(msg)).toEqual([
      { kind: "text", text: "Let me check. One sec." },
      { kind: "tool", part: { type: "tool-get_standings", state: "output-available" } },
      { kind: "text", text: "You're 3rd." },
    ]);
  });

  it("ignores non-text, non-tool parts", () => {
    const msg = { id: "2", role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "hi" },
    ] };
    expect(messageSegments(msg)).toEqual([{ kind: "text", text: "hi" }]);
  });

  it("recognises dynamic-tool parts", () => {
    const msg = { id: "3", role: "assistant", parts: [{ type: "dynamic-tool", toolName: "get_standings", state: "input-available" }] };
    expect(messageSegments(msg)).toEqual([{ kind: "tool", part: { type: "dynamic-tool", toolName: "get_standings", state: "input-available" } }]);
  });
});
