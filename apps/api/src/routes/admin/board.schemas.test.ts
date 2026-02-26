import { describe, expect, it } from "vitest";
import {
  boardIdParamSchema,
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnIdParamSchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
} from "./board.schemas";

describe("boardIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(boardIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => boardIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => boardIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => boardIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("boardCreateBodySchema", () => {
  it("accepts valid name and description", () => {
    expect(
      boardCreateBodySchema.parse({ name: "Sprint Board", description: "A board" }),
    ).toEqual({ name: "Sprint Board", description: "A board" });
  });

  it("accepts name only", () => {
    expect(boardCreateBodySchema.parse({ name: "Sprint Board" })).toEqual({
      name: "Sprint Board",
    });
  });

  it("accepts null description", () => {
    expect(
      boardCreateBodySchema.parse({ name: "Board", description: null }),
    ).toEqual({ name: "Board", description: null });
  });

  it("accepts createdBy", () => {
    expect(
      boardCreateBodySchema.parse({ name: "Board", createdBy: "admin" }),
    ).toEqual({ name: "Board", createdBy: "admin" });
  });

  it("accepts null createdBy", () => {
    expect(
      boardCreateBodySchema.parse({ name: "Board", createdBy: null }),
    ).toEqual({ name: "Board", createdBy: null });
  });

  it("rejects empty name", () => {
    expect(() => boardCreateBodySchema.parse({ name: "" })).toThrow();
  });

  it("rejects name exceeding 100 characters", () => {
    expect(() =>
      boardCreateBodySchema.parse({ name: "x".repeat(101) }),
    ).toThrow();
  });

  it("accepts name at exactly 100 characters", () => {
    const name = "x".repeat(100);
    expect(boardCreateBodySchema.parse({ name })).toEqual({ name });
  });

  it("rejects description exceeding 500 characters", () => {
    expect(() =>
      boardCreateBodySchema.parse({ name: "Board", description: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() => boardCreateBodySchema.parse({})).toThrow();
  });

  it("rejects createdBy exceeding 100 characters", () => {
    expect(() =>
      boardCreateBodySchema.parse({ name: "Board", createdBy: "x".repeat(101) }),
    ).toThrow();
  });
});

describe("boardUpdateBodySchema", () => {
  it("accepts name update", () => {
    expect(boardUpdateBodySchema.parse({ name: "New Name" })).toEqual({
      name: "New Name",
    });
  });

  it("accepts description update", () => {
    expect(
      boardUpdateBodySchema.parse({ description: "New desc" }),
    ).toEqual({ description: "New desc" });
  });

  it("accepts null description", () => {
    expect(
      boardUpdateBodySchema.parse({ description: null }),
    ).toEqual({ description: null });
  });

  it("accepts both fields", () => {
    expect(
      boardUpdateBodySchema.parse({ name: "New", description: "Desc" }),
    ).toEqual({ name: "New", description: "Desc" });
  });

  it("accepts empty object", () => {
    expect(boardUpdateBodySchema.parse({})).toEqual({});
  });

  it("rejects empty name", () => {
    expect(() => boardUpdateBodySchema.parse({ name: "" })).toThrow();
  });

  it("rejects name exceeding 100 characters", () => {
    expect(() =>
      boardUpdateBodySchema.parse({ name: "x".repeat(101) }),
    ).toThrow();
  });

  it("rejects description exceeding 500 characters", () => {
    expect(() =>
      boardUpdateBodySchema.parse({ description: "x".repeat(501) }),
    ).toThrow();
  });
});

describe("columnIdParamSchema", () => {
  it("coerces string ids to positive integers", () => {
    expect(columnIdParamSchema.parse({ id: "5", colId: "3" })).toEqual({
      id: 5,
      colId: 3,
    });
  });

  it("rejects zero id", () => {
    expect(() =>
      columnIdParamSchema.parse({ id: 0, colId: 1 }),
    ).toThrow();
  });

  it("rejects zero colId", () => {
    expect(() =>
      columnIdParamSchema.parse({ id: 1, colId: 0 }),
    ).toThrow();
  });

  it("rejects non-numeric id", () => {
    expect(() =>
      columnIdParamSchema.parse({ id: "abc", colId: 1 }),
    ).toThrow();
  });

  it("rejects negative colId", () => {
    expect(() =>
      columnIdParamSchema.parse({ id: 1, colId: -1 }),
    ).toThrow();
  });
});

describe("columnCreateBodySchema", () => {
  it("accepts name only", () => {
    expect(columnCreateBodySchema.parse({ name: "New Column" })).toEqual({
      name: "New Column",
    });
  });

  it("accepts name with color", () => {
    expect(
      columnCreateBodySchema.parse({ name: "Urgent", color: "#ff0000" }),
    ).toEqual({ name: "Urgent", color: "#ff0000" });
  });

  it("accepts null color", () => {
    expect(
      columnCreateBodySchema.parse({ name: "Col", color: null }),
    ).toEqual({ name: "Col", color: null });
  });

  it("accepts isDoneColumn", () => {
    expect(
      columnCreateBodySchema.parse({ name: "Done", isDoneColumn: true }),
    ).toEqual({ name: "Done", isDoneColumn: true });
  });

  it("rejects empty name", () => {
    expect(() => columnCreateBodySchema.parse({ name: "" })).toThrow();
  });

  it("rejects name exceeding 100 characters", () => {
    expect(() =>
      columnCreateBodySchema.parse({ name: "x".repeat(101) }),
    ).toThrow();
  });

  it("rejects invalid color format", () => {
    expect(() =>
      columnCreateBodySchema.parse({ name: "Col", color: "red" }),
    ).toThrow();
  });

  it("rejects color with wrong length", () => {
    expect(() =>
      columnCreateBodySchema.parse({ name: "Col", color: "#fff" }),
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() => columnCreateBodySchema.parse({})).toThrow();
  });
});

describe("columnUpdateBodySchema", () => {
  it("accepts name update", () => {
    expect(columnUpdateBodySchema.parse({ name: "Updated" })).toEqual({
      name: "Updated",
    });
  });

  it("accepts position update", () => {
    expect(columnUpdateBodySchema.parse({ position: 2 })).toEqual({
      position: 2,
    });
  });

  it("accepts zero position", () => {
    expect(columnUpdateBodySchema.parse({ position: 0 })).toEqual({
      position: 0,
    });
  });

  it("accepts color update", () => {
    expect(columnUpdateBodySchema.parse({ color: "#00ff00" })).toEqual({
      color: "#00ff00",
    });
  });

  it("accepts null color", () => {
    expect(columnUpdateBodySchema.parse({ color: null })).toEqual({
      color: null,
    });
  });

  it("accepts isDoneColumn update", () => {
    expect(columnUpdateBodySchema.parse({ isDoneColumn: true })).toEqual({
      isDoneColumn: true,
    });
  });

  it("accepts empty object", () => {
    expect(columnUpdateBodySchema.parse({})).toEqual({});
  });

  it("rejects empty name", () => {
    expect(() => columnUpdateBodySchema.parse({ name: "" })).toThrow();
  });

  it("rejects negative position", () => {
    expect(() => columnUpdateBodySchema.parse({ position: -1 })).toThrow();
  });

  it("rejects invalid color", () => {
    expect(() =>
      columnUpdateBodySchema.parse({ color: "invalid" }),
    ).toThrow();
  });
});

describe("columnReorderBodySchema", () => {
  it("accepts valid reorder array", () => {
    const input = {
      columns: [
        { id: 1, position: 0 },
        { id: 2, position: 1 },
        { id: 3, position: 2 },
      ],
    };
    expect(columnReorderBodySchema.parse(input)).toEqual(input);
  });

  it("rejects empty columns array", () => {
    expect(() =>
      columnReorderBodySchema.parse({ columns: [] }),
    ).toThrow();
  });

  it("rejects non-positive id", () => {
    expect(() =>
      columnReorderBodySchema.parse({
        columns: [{ id: 0, position: 0 }],
      }),
    ).toThrow();
  });

  it("rejects negative position", () => {
    expect(() =>
      columnReorderBodySchema.parse({
        columns: [{ id: 1, position: -1 }],
      }),
    ).toThrow();
  });

  it("rejects missing columns field", () => {
    expect(() => columnReorderBodySchema.parse({})).toThrow();
  });
});
