import { describe, expect, it } from "vitest";
import {
  matchesEventType,
  evaluateFilter,
  evaluateRule,
  type RuleInput,
} from "./rule-engine";
import type { FilterConditionRow, ChannelTargetRow } from "@dragons/db/schema";

// ── matchesEventType ────────────────────────────────────────────────────────

describe("matchesEventType", () => {
  it("matches exact event type", () => {
    expect(matchesEventType("match.cancelled", "match.cancelled")).toBe(true);
  });

  it("rejects different exact event type", () => {
    expect(matchesEventType("match.cancelled", "match.rescheduled")).toBe(
      false,
    );
  });

  it("universal wildcard matches everything", () => {
    expect(matchesEventType("*", "match.cancelled")).toBe(true);
    expect(matchesEventType("*", "booking.created")).toBe(true);
    expect(matchesEventType("*", "referee.assigned")).toBe(true);
  });

  it("trailing wildcard matches single-level child", () => {
    expect(matchesEventType("match.*", "match.cancelled")).toBe(true);
  });

  it("trailing wildcard matches multi-level child", () => {
    expect(matchesEventType("match.*", "match.schedule.changed")).toBe(true);
  });

  it("trailing wildcard does not match unrelated prefix", () => {
    expect(matchesEventType("match.*", "booking.created")).toBe(false);
  });

  it("trailing wildcard does not match bare prefix without dot", () => {
    expect(matchesEventType("match.*", "matchday.started")).toBe(false);
  });

  it("non-wildcard pattern does not partially match", () => {
    expect(matchesEventType("match", "match.cancelled")).toBe(false);
  });
});

// ── evaluateFilter ──────────────────────────────────────────────────────────

describe("evaluateFilter", () => {
  const payload = {
    teamIds: [10, 20],
    leagueId: 5,
    venueId: 99,
  };

  describe("operator: any", () => {
    it("always returns true", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "any",
        value: null,
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });
  });

  describe("operator: eq", () => {
    it("matches scalar field", () => {
      const filter: FilterConditionRow = {
        field: "leagueId",
        operator: "eq",
        value: "5",
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });

    it("rejects non-matching scalar field", () => {
      const filter: FilterConditionRow = {
        field: "leagueId",
        operator: "eq",
        value: "999",
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });

    it("matches array field (teamId -> teamIds) when any element matches", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "eq",
        value: "20",
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });

    it("rejects array field when no element matches", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "eq",
        value: "30",
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });
  });

  describe("operator: neq", () => {
    it("returns true when field does not match", () => {
      const filter: FilterConditionRow = {
        field: "leagueId",
        operator: "neq",
        value: "999",
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });

    it("returns false when field matches", () => {
      const filter: FilterConditionRow = {
        field: "leagueId",
        operator: "neq",
        value: "5",
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });

    it("returns false when any array element matches (negation of eq on array)", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "neq",
        value: "10",
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });
  });

  describe("operator: in", () => {
    it("matches scalar field in allowed list", () => {
      const filter: FilterConditionRow = {
        field: "venueId",
        operator: "in",
        value: ["99", "100"],
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });

    it("rejects scalar field not in allowed list", () => {
      const filter: FilterConditionRow = {
        field: "venueId",
        operator: "in",
        value: ["100", "200"],
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });

    it("matches array field when any element is in allowed list", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "in",
        value: ["20", "30"],
      };
      expect(evaluateFilter(filter, payload)).toBe(true);
    });

    it("rejects array field when no element is in allowed list", () => {
      const filter: FilterConditionRow = {
        field: "teamId",
        operator: "in",
        value: ["30", "40"],
      };
      expect(evaluateFilter(filter, payload)).toBe(false);
    });
  });

  describe("source field", () => {
    it("matches source from separate parameter", () => {
      const filter: FilterConditionRow = {
        field: "source",
        operator: "eq",
        value: "sync",
      };
      expect(evaluateFilter(filter, {}, "sync")).toBe(true);
    });

    it("rejects non-matching source", () => {
      const filter: FilterConditionRow = {
        field: "source",
        operator: "eq",
        value: "manual",
      };
      expect(evaluateFilter(filter, {}, "sync")).toBe(false);
    });

    it("source with in operator", () => {
      const filter: FilterConditionRow = {
        field: "source",
        operator: "in",
        value: ["sync", "reconciliation"],
      };
      expect(evaluateFilter(filter, {}, "sync")).toBe(true);
    });
  });
});

// ── evaluateRule ────────────────────────────────────────────────────────────

describe("evaluateRule", () => {
  const channels: ChannelTargetRow[] = [
    { channel: "in_app", targetId: "admin-group" },
  ];

  const baseRule: RuleInput = {
    eventTypes: ["match.*"],
    filters: [],
    channels,
    urgencyOverride: null,
    enabled: true,
  };

  const payload = {
    teamIds: [10, 20],
    leagueId: 5,
  };

  it("matches when event type matches and no filters", () => {
    const result = evaluateRule(baseRule, "match.cancelled", payload, "sync");
    expect(result).toEqual({
      matched: true,
      channels,
      urgencyOverride: null,
    });
  });

  it("does not match disabled rule", () => {
    const rule: RuleInput = { ...baseRule, enabled: false };
    const result = evaluateRule(rule, "match.cancelled", payload, "sync");
    expect(result.matched).toBe(false);
  });

  it("does not match when event type does not match", () => {
    const result = evaluateRule(baseRule, "booking.created", payload, "sync");
    expect(result.matched).toBe(false);
  });

  it("matches with multiple event type patterns", () => {
    const rule: RuleInput = {
      ...baseRule,
      eventTypes: ["booking.*", "match.cancelled"],
    };
    const result = evaluateRule(rule, "match.cancelled", payload, "sync");
    expect(result.matched).toBe(true);
  });

  it("applies AND logic to filters — all must pass", () => {
    const rule: RuleInput = {
      ...baseRule,
      filters: [
        { field: "teamId", operator: "eq", value: "10" },
        { field: "leagueId", operator: "eq", value: "5" },
      ],
    };
    const result = evaluateRule(rule, "match.cancelled", payload, "sync");
    expect(result.matched).toBe(true);
  });

  it("rejects when any filter fails", () => {
    const rule: RuleInput = {
      ...baseRule,
      filters: [
        { field: "teamId", operator: "eq", value: "10" },
        { field: "leagueId", operator: "eq", value: "999" },
      ],
    };
    const result = evaluateRule(rule, "match.cancelled", payload, "sync");
    expect(result.matched).toBe(false);
  });

  it("returns urgencyOverride when set", () => {
    const rule: RuleInput = {
      ...baseRule,
      urgencyOverride: "immediate",
    };
    const result = evaluateRule(rule, "match.cancelled", payload, "sync");
    expect(result.urgencyOverride).toBe("immediate");
  });

  it("returns null urgencyOverride when not set", () => {
    const result = evaluateRule(baseRule, "match.cancelled", payload, "sync");
    expect(result.urgencyOverride).toBeNull();
  });

  it("filters with source check", () => {
    const rule: RuleInput = {
      ...baseRule,
      filters: [{ field: "source", operator: "eq", value: "manual" }],
    };
    expect(
      evaluateRule(rule, "match.cancelled", payload, "sync").matched,
    ).toBe(false);
    expect(
      evaluateRule(rule, "match.cancelled", payload, "manual").matched,
    ).toBe(true);
  });
});
