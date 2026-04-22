import { describe, expect, it } from "vitest";
import {
  parseHistoryFilterState,
  summaryKey,
  gamesKey,
  resolvePresetRange,
} from "./filter-state";

describe("parseHistoryFilterState", () => {
  it("defaults: tab=workload, preset=season, status=[]", () => {
    const s = parseHistoryFilterState({});
    expect(s.tab).toBe("workload");
    expect(s.preset).toBe("season");
    expect(s.status).toEqual([]);
    expect(s.limit).toBe(50);
    expect(s.offset).toBe(0);
  });

  it("parses comma-list status", () => {
    const s = parseHistoryFilterState({ status: "cancelled,forfeited" });
    expect(s.status).toEqual(["cancelled", "forfeited"]);
  });

  it("treats status=all as empty array", () => {
    const s = parseHistoryFilterState({ status: "all" });
    expect(s.status).toEqual([]);
  });

  it("legacy status=active maps to ['played']", () => {
    const s = parseHistoryFilterState({ status: "active" });
    expect(s.status).toEqual(["played"]);
  });

  it("parses ref as number", () => {
    const s = parseHistoryFilterState({ ref: "42" });
    expect(s.ref).toBe(42);
  });

  it("clamps limit to [25,50,100]", () => {
    expect(parseHistoryFilterState({ limit: "25" }).limit).toBe(25);
    expect(parseHistoryFilterState({ limit: "100" }).limit).toBe(100);
    expect(parseHistoryFilterState({ limit: "7" }).limit).toBe(50);
  });
});

describe("resolvePresetRange", () => {
  it("season returns season dates", () => {
    const r = resolvePresetRange("season", {
      from: "2025-08-01", to: "2026-07-31", today: new Date("2026-04-22"),
    });
    expect(r).toEqual({ dateFrom: "2025-08-01", dateTo: "2026-07-31" });
  });

  it("30d returns today-30 .. today", () => {
    const r = resolvePresetRange("30d", {
      from: "2025-08-01", to: "2026-07-31",
      today: new Date("2026-04-22T00:00:00Z"),
    });
    expect(r).toEqual({ dateFrom: "2026-03-23", dateTo: "2026-04-22" });
  });

  it("month returns first..last of current month", () => {
    const r = resolvePresetRange("month", {
      from: "2025-08-01", to: "2026-07-31",
      today: new Date("2026-04-22T00:00:00Z"),
    });
    expect(r).toEqual({ dateFrom: "2026-04-01", dateTo: "2026-04-30" });
  });
});

describe("query builders", () => {
  it("summaryKey always sends status=all", () => {
    const state = parseHistoryFilterState({ status: "cancelled" });
    const key = summaryKey({ ...state, dateFrom: "2025-08-01", dateTo: "2026-07-31" });
    expect(key).toContain("status=all");
    expect(key).not.toContain("cancelled");
  });

  it("gamesKey sends comma-list status", () => {
    const state = {
      ...parseHistoryFilterState({}),
      status: ["cancelled", "forfeited"] as const,
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    };
    const key = gamesKey(state, 50, 0);
    expect(key).toContain("status=cancelled%2Cforfeited");
  });

  it("gamesKey includes refereeApiId when present", () => {
    const state = {
      ...parseHistoryFilterState({}),
      ref: 42,
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    };
    const key = gamesKey(state, 50, 0);
    expect(key).toContain("refereeApiId=42");
  });
});
