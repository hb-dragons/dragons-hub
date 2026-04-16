import { describe, it, expect } from "vitest";
import { buildQueryString } from "./query-string";

describe("buildQueryString", () => {
  it("returns empty string for empty params", () => {
    expect(buildQueryString({})).toBe("");
  });

  it("builds correct query string from params", () => {
    const result = buildQueryString({ page: 1, limit: 10 });
    expect(result).toBe("?page=1&limit=10");
  });

  it("filters out undefined values", () => {
    const result = buildQueryString({
      page: 1,
      limit: undefined,
      sort: "name",
    });
    expect(result).toBe("?page=1&sort=name");
  });

  it("returns empty string when all values are undefined", () => {
    const result = buildQueryString({
      page: undefined,
      limit: undefined,
    });
    expect(result).toBe("");
  });

  it("encodes special characters", () => {
    const result = buildQueryString({ q: "hello world", tag: "a&b" });
    expect(result).toContain("q=hello+world");
    expect(result).toContain("tag=a%26b");
  });

  it("handles boolean values", () => {
    const result = buildQueryString({ active: true, deleted: false });
    expect(result).toBe("?active=true&deleted=false");
  });

  it("handles string values", () => {
    const result = buildQueryString({ name: "test" });
    expect(result).toBe("?name=test");
  });
});
