import { describe, expect, it } from "vitest";

import { diffAssignees } from "@/lib/board/assignee-diff";

/**
 * The assignee picker batches its selection and hands back the final set, so
 * the task-detail sheet has to work out which assignments to add and which to
 * remove (#219's convention, exercised by the task sheet in #222).
 */

describe("diffAssignees", () => {
  it("adds what the user selected and removes what they cleared", () => {
    expect(diffAssignees(["keep", "drop"], new Set(["keep", "new"]))).toEqual({
      added: ["new"],
      removed: ["drop"],
    });
  });

  it("asks for nothing when the selection is unchanged", () => {
    expect(diffAssignees(["a", "b"], new Set(["b", "a"]))).toEqual({ added: [], removed: [] });
  });

  it("removes everyone when the selection is emptied", () => {
    expect(diffAssignees(["a", "b"], new Set())).toEqual({ added: [], removed: ["a", "b"] });
  });

  it("adds everyone for a task that had no assignees", () => {
    expect(diffAssignees([], new Set(["a"]))).toEqual({ added: ["a"], removed: [] });
  });

  // The task's assignee list comes from the server, which has no reason to
  // repeat a user — but a duplicate must not produce two remove calls.
  it("asks once per user even if the task lists one twice", () => {
    expect(diffAssignees(["a", "a"], new Set()).removed).toEqual(["a"]);
  });
});
