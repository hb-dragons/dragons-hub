import { describe, expect, it } from "vitest";
import {
  refereeRulesParamSchema,
  refereeRuleItemSchema,
  refereeRulesArraySchema,
  updateRefereeRulesBodySchema,
} from "./referee-rules";

describe("refereeRulesParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(refereeRulesParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("accepts numeric id directly", () => {
    expect(refereeRulesParamSchema.parse({ id: 10 })).toEqual({ id: 10 });
  });

  it("rejects zero", () => {
    expect(() => refereeRulesParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative id", () => {
    expect(() => refereeRulesParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric string", () => {
    expect(() => refereeRulesParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("refereeRuleItemSchema", () => {
  it("accepts item where deny is true and allowSr flags are false", () => {
    const result = refereeRuleItemSchema.parse({
      teamId: 1,
      deny: true,
      allowSr1: false,
      allowSr2: false,
    });
    expect(result).toEqual({ teamId: 1, deny: true, allowSr1: false, allowSr2: false });
  });

  it("accepts item where allowSr1 is true", () => {
    const result = refereeRuleItemSchema.parse({
      teamId: 2,
      deny: false,
      allowSr1: true,
      allowSr2: false,
    });
    expect(result).toMatchObject({ allowSr1: true });
  });

  it("accepts item where allowSr2 is true", () => {
    const result = refereeRuleItemSchema.parse({
      teamId: 3,
      deny: false,
      allowSr1: false,
      allowSr2: true,
    });
    expect(result).toMatchObject({ allowSr2: true });
  });

  it("accepts item where all flags are true", () => {
    const result = refereeRuleItemSchema.parse({
      teamId: 4,
      deny: true,
      allowSr1: true,
      allowSr2: true,
    });
    expect(result).toMatchObject({ teamId: 4, deny: true, allowSr1: true, allowSr2: true });
  });

  it("rejects item where all flags are false", () => {
    expect(() =>
      refereeRuleItemSchema.parse({
        teamId: 1,
        deny: false,
        allowSr1: false,
        allowSr2: false,
      }),
    ).toThrow("Deny must be true, or at least one of allowSr1/allowSr2 must be true");
  });

  it("rejects non-positive teamId", () => {
    expect(() =>
      refereeRuleItemSchema.parse({
        teamId: 0,
        deny: true,
        allowSr1: false,
        allowSr2: false,
      }),
    ).toThrow();
  });

  it("rejects negative teamId", () => {
    expect(() =>
      refereeRuleItemSchema.parse({
        teamId: -5,
        deny: true,
        allowSr1: false,
        allowSr2: false,
      }),
    ).toThrow();
  });

  it("rejects non-integer teamId", () => {
    expect(() =>
      refereeRuleItemSchema.parse({
        teamId: 1.5,
        deny: true,
        allowSr1: false,
        allowSr2: false,
      }),
    ).toThrow();
  });

  it("rejects missing deny field", () => {
    expect(() =>
      refereeRuleItemSchema.parse({
        teamId: 1,
        allowSr1: true,
        allowSr2: false,
      }),
    ).toThrow();
  });
});

describe("refereeRulesArraySchema", () => {
  it("accepts empty array", () => {
    expect(refereeRulesArraySchema.parse([])).toEqual([]);
  });

  it("accepts array with one valid item", () => {
    const result = refereeRulesArraySchema.parse([
      { teamId: 1, deny: true, allowSr1: false, allowSr2: false },
    ]);
    expect(result).toHaveLength(1);
  });

  it("accepts array with multiple unique teamIds", () => {
    const result = refereeRulesArraySchema.parse([
      { teamId: 1, deny: true, allowSr1: false, allowSr2: false },
      { teamId: 2, deny: false, allowSr1: true, allowSr2: false },
    ]);
    expect(result).toHaveLength(2);
  });

  it("rejects array with duplicate teamIds", () => {
    expect(() =>
      refereeRulesArraySchema.parse([
        { teamId: 1, deny: true, allowSr1: false, allowSr2: false },
        { teamId: 1, deny: false, allowSr1: true, allowSr2: false },
      ]),
    ).toThrow("Duplicate teamId entries are not allowed");
  });

  it("rejects item in array that fails ruleItem refine", () => {
    expect(() =>
      refereeRulesArraySchema.parse([
        { teamId: 1, deny: false, allowSr1: false, allowSr2: false },
      ]),
    ).toThrow();
  });
});

describe("updateRefereeRulesBodySchema", () => {
  it("accepts valid rules array", () => {
    const result = updateRefereeRulesBodySchema.parse({
      rules: [{ teamId: 1, deny: true, allowSr1: false, allowSr2: false }],
    });
    expect(result.rules).toHaveLength(1);
  });

  it("accepts empty rules array", () => {
    const result = updateRefereeRulesBodySchema.parse({ rules: [] });
    expect(result.rules).toEqual([]);
  });

  it("rejects missing rules field", () => {
    expect(() => updateRefereeRulesBodySchema.parse({})).toThrow();
  });

  it("rejects rules with duplicate teamIds", () => {
    expect(() =>
      updateRefereeRulesBodySchema.parse({
        rules: [
          { teamId: 5, deny: true, allowSr1: false, allowSr2: false },
          { teamId: 5, deny: false, allowSr1: true, allowSr2: false },
        ],
      }),
    ).toThrow("Duplicate teamId entries are not allowed");
  });

  it("rejects rules containing an item where all flags are false", () => {
    expect(() =>
      updateRefereeRulesBodySchema.parse({
        rules: [{ teamId: 1, deny: false, allowSr1: false, allowSr2: false }],
      }),
    ).toThrow();
  });
});
