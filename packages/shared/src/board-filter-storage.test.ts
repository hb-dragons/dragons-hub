import { describe, it, expect } from "vitest";
import {
  serializeFilters,
  parseFilters,
  type SerialisableBoardFilters,
} from "./board-filter-storage";

describe("board-filter-storage", () => {
  it("round-trips an empty filter", () => {
    const original: SerialisableBoardFilters = {
      mine: false,
      priority: null,
      dueSoon: false,
      unassigned: false,
      assigneeIds: new Set<string>(),
    };
    const serialised = serializeFilters(original);
    const parsed = parseFilters(serialised);
    expect(parsed).toEqual(original);
    expect(parsed.assigneeIds).toBeInstanceOf(Set);
  });

  it("round-trips a populated filter", () => {
    const original: SerialisableBoardFilters = {
      mine: true,
      priority: "urgent",
      dueSoon: true,
      unassigned: false,
      assigneeIds: new Set(["u1", "u2"]),
    };
    const parsed = parseFilters(serializeFilters(original));
    expect(parsed.mine).toBe(true);
    expect(parsed.priority).toBe("urgent");
    expect(parsed.dueSoon).toBe(true);
    expect(parsed.unassigned).toBe(false);
    expect([...parsed.assigneeIds].sort()).toEqual(["u1", "u2"]);
  });

  it("returns defaults when input is null", () => {
    const parsed = parseFilters(null);
    expect(parsed).toEqual({
      mine: false,
      priority: null,
      dueSoon: false,
      unassigned: false,
      assigneeIds: new Set<string>(),
    });
  });

  it("returns defaults on malformed JSON", () => {
    const parsed = parseFilters("not-json");
    expect(parsed.mine).toBe(false);
    expect(parsed.assigneeIds).toBeInstanceOf(Set);
    expect(parsed.assigneeIds.size).toBe(0);
  });

  it("rejects unknown priority values", () => {
    const parsed = parseFilters(
      JSON.stringify({
        mine: false,
        priority: "made-up",
        dueSoon: false,
        unassigned: false,
        assigneeIds: [],
      }),
    );
    expect(parsed.priority).toBeNull();
  });

  it("ignores unknown fields", () => {
    const parsed = parseFilters(
      JSON.stringify({
        mine: true,
        priority: null,
        dueSoon: false,
        unassigned: false,
        assigneeIds: [],
        rogueField: 999,
      }),
    );
    expect(parsed.mine).toBe(true);
  });
});
