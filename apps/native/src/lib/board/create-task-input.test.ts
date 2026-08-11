import { describe, expect, it } from "vitest";

import { buildCreateTaskInput } from "@/lib/board/create-task-input";

/**
 * The quick-create sheet's submit gate and payload, as one function (#222).
 * The sheet is a route now, so what it sends has to be checkable without
 * mounting it.
 */

const draft = {
  columnId: 3,
  title: "Book the hall",
  description: "",
  priority: "normal" as const,
  dueDate: null,
};

describe("buildCreateTaskInput", () => {
  it("sends the trimmed title and the chosen column", () => {
    expect(buildCreateTaskInput({ ...draft, title: "  Book the hall  " })).toEqual({
      columnId: 3,
      title: "Book the hall",
    });
  });

  // Every optional field the server would default anyway is left out, so a
  // task created with nothing but a title posts nothing but a title.
  it("omits an empty description, a normal priority and an unset due date", () => {
    const body = buildCreateTaskInput(draft);

    expect(body).not.toHaveProperty("description");
    expect(body).not.toHaveProperty("priority");
    expect(body).not.toHaveProperty("dueDate");
  });

  it("sends the description, priority and due date once they are set", () => {
    expect(
      buildCreateTaskInput({
        ...draft,
        description: "Ask the caretaker",
        priority: "urgent",
        dueDate: "2026-08-20",
      }),
    ).toEqual({
      columnId: 3,
      title: "Book the hall",
      description: "Ask the caretaker",
      priority: "urgent",
      dueDate: "2026-08-20",
    });
  });

  // Whitespace is not a description.
  it("omits a description that is only whitespace", () => {
    expect(buildCreateTaskInput({ ...draft, description: "   " })).not.toHaveProperty(
      "description",
    );
  });

  it("refuses a draft with no title", () => {
    expect(buildCreateTaskInput({ ...draft, title: "   " })).toBeNull();
  });

  // The column comes from a route param, so "no column" is reachable: a stale
  // deep link, or a board whose columns have not loaded yet.
  it("refuses a draft with no column", () => {
    expect(buildCreateTaskInput({ ...draft, columnId: null })).toBeNull();
  });
});
