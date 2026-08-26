import { describe, expect, it } from "vitest";

import { strings } from "./strings";

function collect(
  value: unknown,
  path: string,
  out: Array<{ path: string; text: string }>,
): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collect(child, path ? `${path}.${key}` : key, out);
    }
  }
}

const literals: Array<{ path: string; text: string }> = [];
collect(strings, "", literals);

describe("strings", () => {
  it("has literals to check", () => {
    expect(literals.length).toBeGreaterThan(50);
  });

  // The site addresses visitors as "du" (decision 2026-08-26, issue #267).
  // Formal address left the copy inconsistent between pages.
  it.each([
    ["Sie", /\bSie\b/],
    ["Ihr", /\bIhre?[mnrs]?\b/],
    ["Ihnen", /\bIhnen\b/],
  ])("uses no formal %s", (_label, pattern) => {
    const offenders = literals.filter((entry) => pattern.test(entry.text));
    expect(offenders).toEqual([]);
  });
});
