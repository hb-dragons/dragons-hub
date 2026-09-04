import { describe, expect, it } from "vitest";
import {
  userIdParamSchema,
  userRefereeLinkBodySchema,
  userStaffLinkBodySchema,
} from "./user";

describe("userRefereeLinkBodySchema", () => {
  it("accepts a positive integer refereeId", () => {
    const result = userRefereeLinkBodySchema.parse({ refereeId: 42 });
    expect(result).toEqual({ refereeId: 42 });
  });

  it("accepts refereeId: null (unlink)", () => {
    const result = userRefereeLinkBodySchema.parse({ refereeId: null });
    expect(result).toEqual({ refereeId: null });
  });

  it("rejects missing refereeId field", () => {
    expect(() => userRefereeLinkBodySchema.parse({})).toThrow();
  });

  it("rejects zero", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: 0 })).toThrow();
  });

  it("rejects negative integer", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: -1 })).toThrow();
  });

  it("rejects non-integer (float)", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: 1.5 })).toThrow();
  });

  it("rejects string", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: "42" })).toThrow();
  });
});

// user.id is a better-auth text id (text().primaryKey()), not a serial int,
// so this deliberately does not alias the shared numeric idParamSchema.
describe("userIdParamSchema", () => {
  it("accepts a better-auth text id", () => {
    expect(userIdParamSchema.parse({ id: "user-abc123" })).toEqual({
      id: "user-abc123",
    });
  });

  it("rejects an empty id", () => {
    expect(userIdParamSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("rejects an id over 255 characters", () => {
    expect(userIdParamSchema.safeParse({ id: "a".repeat(256) }).success).toBe(
      false,
    );
  });

  it("rejects a missing id", () => {
    expect(userIdParamSchema.safeParse({}).success).toBe(false);
  });

  it("does not coerce a numeric id, unlike the shared idParamSchema", () => {
    expect(userIdParamSchema.parse({ id: "5" })).toEqual({ id: "5" });
  });
});

describe("userStaffLinkBodySchema", () => {
  it("accepts a positive integer staffId", () => {
    expect(userStaffLinkBodySchema.parse({ staffId: 7 })).toEqual({ staffId: 7 });
  });

  it("accepts staffId: null (unlink)", () => {
    expect(userStaffLinkBodySchema.parse({ staffId: null })).toEqual({
      staffId: null,
    });
  });

  it("accepts the optional grantCoachRole flag", () => {
    expect(userStaffLinkBodySchema.parse({ staffId: 7, grantCoachRole: true })).toEqual({
      staffId: 7,
      grantCoachRole: true,
    });
  });

  it("leaves grantCoachRole undefined when omitted, so the service decides the default", () => {
    expect(userStaffLinkBodySchema.parse({ staffId: 7 }).grantCoachRole).toBeUndefined();
  });

  it("rejects a missing staffId field", () => {
    expect(userStaffLinkBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects zero", () => {
    expect(userStaffLinkBodySchema.safeParse({ staffId: 0 }).success).toBe(false);
  });

  it("rejects a float", () => {
    expect(userStaffLinkBodySchema.safeParse({ staffId: 1.5 }).success).toBe(false);
  });

  it("rejects a string staffId", () => {
    expect(userStaffLinkBodySchema.safeParse({ staffId: "7" }).success).toBe(false);
  });

  it("rejects a non-boolean grantCoachRole", () => {
    expect(
      userStaffLinkBodySchema.safeParse({ staffId: 7, grantCoachRole: "yes" }).success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      userStaffLinkBodySchema.safeParse({ staffId: 7, role: "coach" }).success,
    ).toBe(false);
  });
});
