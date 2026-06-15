import { describe, expect, it } from "vitest";
import { messageText } from "./messages";

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
