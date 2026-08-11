import { describe, expect, it } from "vitest";

import { publishedOnly } from "./published";

describe("publishedOnly", () => {
  it("keeps published entries", () => {
    expect(publishedOnly({ data: { _status: "published" } })).toBe(true);
  });

  it("drops drafts", () => {
    expect(publishedOnly({ data: { _status: "draft" } })).toBe(false);
  });

  it("drops entries with no status rather than assuming published", () => {
    expect(publishedOnly({ data: {} })).toBe(false);
    expect(publishedOnly({ data: { _status: null } })).toBe(false);
  });
});
