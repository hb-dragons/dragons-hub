import { describe, expect, it } from "vitest";

import { anyone, publishedOrAuthed } from "./access";

type PublishedOrAuthedArgs = Parameters<typeof publishedOrAuthed>[0];

describe("publishedOrAuthed", () => {
  it("lets an authenticated user (editor or API-key build user) read everything", () => {
    const result = publishedOrAuthed({
      req: { user: { id: 1 } },
    } as PublishedOrAuthedArgs);
    expect(result).toBe(true);
  });

  it("restricts anonymous readers to published docs only", () => {
    const result = publishedOrAuthed({
      req: { user: null },
    } as PublishedOrAuthedArgs);
    expect(result).toEqual({ _status: { equals: "published" } });
  });
});

describe("anyone", () => {
  it("grants read to everyone", () => {
    expect(anyone({} as Parameters<typeof anyone>[0])).toBe(true);
  });
});
