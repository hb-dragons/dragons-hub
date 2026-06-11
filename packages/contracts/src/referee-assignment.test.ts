import { describe, expect, it } from "vitest";
import {
  spielplanIdParamSchema,
  refAssignmentCandidatesQuerySchema,
  assignmentSlotParamSchema,
} from "./referee-assignment";

describe("spielplanIdParamSchema", () => {
  it("coerces a numeric string to a positive integer", () => {
    expect(spielplanIdParamSchema.parse({ spielplanId: "12345" })).toEqual({ spielplanId: 12345 });
  });

  it("rejects a non-numeric string", () => {
    expect(() => spielplanIdParamSchema.parse({ spielplanId: "abc" })).toThrow();
  });

  it("rejects zero", () => {
    expect(() => spielplanIdParamSchema.parse({ spielplanId: "0" })).toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => spielplanIdParamSchema.parse({ spielplanId: "-1" })).toThrow();
  });
});

describe("refAssignmentCandidatesQuerySchema", () => {
  it("applies defaults when empty", () => {
    expect(refAssignmentCandidatesQuerySchema.parse({})).toEqual({
      search: "",
      pageFrom: 0,
      pageSize: 15,
    });
  });

  it("coerces pageFrom and pageSize numeric strings", () => {
    const result = refAssignmentCandidatesQuerySchema.parse({ pageFrom: "2", pageSize: "30" });
    expect(result).toMatchObject({ pageFrom: 2, pageSize: 30 });
  });

  it("transforms slot=1 to the numeric literal 1", () => {
    expect(refAssignmentCandidatesQuerySchema.parse({ slot: "1" }).slot).toBe(1);
  });

  it("transforms slot=2 to the numeric literal 2", () => {
    expect(refAssignmentCandidatesQuerySchema.parse({ slot: "2" }).slot).toBe(2);
  });

  it("falls back to undefined for an out-of-range slot value", () => {
    expect(refAssignmentCandidatesQuerySchema.parse({ slot: "3" }).slot).toBeUndefined();
  });

  it("falls back to undefined for a non-numeric slot value", () => {
    expect(refAssignmentCandidatesQuerySchema.parse({ slot: "foo" }).slot).toBeUndefined();
  });

  it("rejects negative pageFrom", () => {
    expect(() => refAssignmentCandidatesQuerySchema.parse({ pageFrom: "-1" })).toThrow();
  });

  it("rejects pageSize below 1", () => {
    expect(() => refAssignmentCandidatesQuerySchema.parse({ pageSize: "0" })).toThrow();
  });

  it("rejects pageSize above 100", () => {
    expect(() => refAssignmentCandidatesQuerySchema.parse({ pageSize: "101" })).toThrow();
  });

  it("rejects a non-numeric pageSize", () => {
    expect(() => refAssignmentCandidatesQuerySchema.parse({ pageSize: "abc" })).toThrow();
  });
});

describe("assignmentSlotParamSchema", () => {
  it("coerces both spielplanId and slotNumber", () => {
    expect(assignmentSlotParamSchema.parse({ spielplanId: "12345", slotNumber: "2" })).toEqual({
      spielplanId: 12345,
      slotNumber: 2,
    });
  });

  it("rejects a zero spielplanId", () => {
    expect(() => assignmentSlotParamSchema.parse({ spielplanId: "0", slotNumber: "1" })).toThrow();
  });

  it("rejects an out-of-range slotNumber", () => {
    expect(() => assignmentSlotParamSchema.parse({ spielplanId: "1", slotNumber: "3" })).toThrow();
  });
});
