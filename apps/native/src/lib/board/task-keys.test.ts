import { describe, expect, it } from "vitest";

import { boardTasksKeyPrefix, isBoardTasksKey } from "@/lib/board/task-keys";

/**
 * Every board mutation invalidates the task list by matching keys rather than
 * naming one, because the list is keyed by its filters too — the board screen
 * and the sheets over it hold several variants of the same board at once.
 */

describe("isBoardTasksKey", () => {
  const matches = isBoardTasksKey(7);

  it("matches the unfiltered list", () => {
    expect(matches([boardTasksKeyPrefix(7), null])).toBe(true);
  });

  it("matches every filtered variant of the same board", () => {
    expect(matches([boardTasksKeyPrefix(7), { priority: "urgent" }])).toBe(true);
  });

  it("leaves another board's tasks alone", () => {
    expect(matches([boardTasksKeyPrefix(8), null])).toBe(false);
  });

  // The board record and a task's detail are keyed by a plain string, so the
  // filter has to survive meeting one.
  it("ignores a key that is not a list key", () => {
    expect(matches("admin/boards/7")).toBe(false);
    expect(matches("admin/tasks/42")).toBe(false);
    expect(matches(undefined)).toBe(false);
  });

  // `admin/boards/7/tasks` is a prefix of nothing else today, but matching on
  // equality rather than `startsWith` keeps it that way.
  it("does not match a longer path that starts the same", () => {
    expect(matches([`${boardTasksKeyPrefix(7)}/archived`, null])).toBe(false);
  });
});
