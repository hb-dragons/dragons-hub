import { describe, it, expect } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy entries so conditional classes can be inlined", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("flattens arrays and object maps", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("lets the last conflicting Tailwind utility win", () => {
    // This is the reason cn() exists rather than a plain join: a caller passing
    // className="px-6" must be able to override a component's built-in "px-2".
    expect(cn("px-2", "px-6")).toBe("px-6");
    expect(cn("bg-input", "bg-muted")).toBe("bg-muted");
  });

  it("keeps utilities that only look like they conflict", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });
});
