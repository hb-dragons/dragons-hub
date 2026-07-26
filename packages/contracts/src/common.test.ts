import { describe, expect, it } from "vitest";
import * as contracts from "./index";
import { idParamSchema } from "./common";

describe("idParamSchema", () => {
  it("coerces a string id", () => {
    expect(idParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it.each([0, -1, 1.5, "abc", null, undefined])("rejects %s", (id) => {
    expect(idParamSchema.safeParse({ id }).success).toBe(false);
  });

  it("ignores sibling path params, which groups add via .extend()", () => {
    expect(idParamSchema.parse({ id: "5", fieldName: "kickoffDate" })).toEqual({ id: 5 });
  });
});

/**
 * The literal `{ id: z.coerce.number().int().positive() }` was written out
 * verbatim in fourteen contract files. Each group keeps its own domain-named
 * export, but the `id` field itself has to come from `idParamSchema` — a fresh
 * copy in a new group forks the coercion and bounds rules, and this fails on it.
 */
describe("every :id path param comes from the shared schema", () => {
  const sharedIdField = idParamSchema.shape.id;

  const shapeOf = (value: unknown): Record<string, unknown> | undefined => {
    const shape = (value as { shape?: unknown } | null | undefined)?.shape;
    return typeof shape === "object" && shape !== null
      ? (shape as Record<string, unknown>)
      : undefined;
  };

  // Path-param schemas only. A body schema may legitimately carry an unrelated
  // `id` — `qaChatBodySchema.id` is the AI SDK's chat id, a string.
  const schemasWithId = Object.entries(contracts)
    .filter(([name]) => /Params?Schema$/.test(name))
    .map(([name, value]) => [name, shapeOf(value)] as const)
    .filter(
      (entry): entry is [string, Record<string, unknown>] =>
        entry[1] !== undefined && "id" in entry[1],
    );

  it("finds the exports to check", () => {
    expect(schemasWithId.length).toBeGreaterThanOrEqual(14);
  });

  it.each(schemasWithId.map(([name]) => name))("%s uses the shared id field", (name) => {
    const shape = schemasWithId.find(([n]) => n === name)![1];
    expect(shape["id"]).toBe(sharedIdField);
  });
});
