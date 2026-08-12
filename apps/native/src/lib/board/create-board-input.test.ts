import { describe, expect, it } from "vitest";

import { buildCreateBoardInput } from "@/lib/board/create-board-input";

/**
 * The create-board sheet's submit gate and payload, as one function (#225).
 * The sheet is a route now, so what it sends has to be checkable without
 * mounting it — the same seam `buildCreateTaskInput` gave quick create (#222).
 */

describe("buildCreateBoardInput", () => {
  it("sends the trimmed name", () => {
    expect(buildCreateBoardInput({ name: "  Season prep  ", description: "" })).toEqual({
      name: "Season prep",
    });
  });

  // A board created with nothing but a name posts nothing but a name: the
  // description column is nullable and the server defaults it.
  it("omits an empty description", () => {
    expect(buildCreateBoardInput({ name: "Season prep", description: "" })).not.toHaveProperty(
      "description",
    );
  });

  it("omits a description that is only whitespace", () => {
    expect(buildCreateBoardInput({ name: "Season prep", description: "   " })).not.toHaveProperty(
      "description",
    );
  });

  it("sends the trimmed description once it is set", () => {
    expect(
      buildCreateBoardInput({ name: "Season prep", description: "  Everything pre-season  " }),
    ).toEqual({ name: "Season prep", description: "Everything pre-season" });
  });

  // Which is also what disables the Create button — one question, one answer.
  it("refuses a draft with no name", () => {
    expect(buildCreateBoardInput({ name: "   ", description: "Everything pre-season" })).toBeNull();
  });
});
