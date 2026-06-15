import { describe, expect, it } from "vitest";
import { qaChatBodySchema } from "./qa";

describe("qaChatBodySchema", () => {
  it("accepts a non-empty messages array and optional locale", () => {
    expect(qaChatBodySchema.safeParse({ messages: [{ id: "1" }], locale: "de" }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [{ id: "1" }] }).success).toBe(true);
  });

  it("rejects an empty messages array", () => {
    expect(qaChatBodySchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects a missing messages field", () => {
    expect(qaChatBodySchema.safeParse({ locale: "de" }).success).toBe(false);
  });
});
