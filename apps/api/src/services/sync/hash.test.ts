import { describe, expect, it } from "vitest";
import { computeEntityHash } from "./hash";

describe("computeEntityHash", () => {
  it("returns a hex string", () => {
    const hash = computeEntityHash({ a: 1 });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic output for the same input", () => {
    const a = computeEntityHash({ foo: "bar", num: 42 });
    const b = computeEntityHash({ foo: "bar", num: 42 });

    expect(a).toBe(b);
  });

  it("is key-order independent", () => {
    const a = computeEntityHash({ x: 1, y: 2 });
    const b = computeEntityHash({ y: 2, x: 1 });

    expect(a).toBe(b);
  });

  it("produces different hashes for different data", () => {
    const a = computeEntityHash({ a: 1 });
    const b = computeEntityHash({ a: 2 });

    expect(a).not.toBe(b);
  });

  it("handles empty object", () => {
    const hash = computeEntityHash({});

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles nested objects", () => {
    const hash = computeEntityHash({ nested: { deep: true } });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles null values", () => {
    const hash = computeEntityHash({ a: null });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
