import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import { TASK_ACTIONS, taskAction, type TaskActionKey } from "@/lib/board/task-actions";
import { lookup } from "../../../test/i18n-bundles";
import { SOURCE_FILES, rel, resolveInPackage } from "../../../test/source-tree";

describe("TASK_ACTIONS", () => {
  it("carries each of the board's task actions once", () => {
    expect(TASK_ACTIONS.map((action) => action.key)).toEqual([
      "move",
      "priority",
      "due",
      "delete",
    ]);
  });

  // HIG: destructive actions go last and are marked destructive, so the red
  // row is never adjacent to the one the thumb was reaching for.
  it("puts the destructive action last and marks it", () => {
    const destructive = TASK_ACTIONS.filter((action) => action.destructive);

    expect(destructive).toHaveLength(1);
    expect(TASK_ACTIONS.at(-1)).toBe(destructive[0]);
  });

  it("labels every action from a key both locales carry", () => {
    for (const action of TASK_ACTIONS) {
      expect(lookup(en, action.labelKey), `${action.key} is missing from en.json`).toBeTypeOf(
        "string",
      );
      expect(lookup(de, action.labelKey), `${action.key} is missing from de.json`).toBeTypeOf(
        "string",
      );
    }
  });

  // Issue #220: one implementation serves the menu, so the labels are written
  // once. Two copies is how the deleted action sheet and its Android fallback
  // drifted into two different wordings of the same four actions.
  it("is the only module that spells a task action label", () => {
    const sites = SOURCE_FILES.filter((file) =>
      readFileSync(file, "utf8").includes("board.task.actions."),
    ).map(rel);

    expect(sites).toEqual(["src/lib/board/task-actions.ts"]);
  });

  // UIKit draws these itself inside the menu, so they are SF Symbol names
  // rather than roles from `lib/ui/icons.ts` — dot-separated, and old enough
  // for the app's iOS 16.4 floor.
  it("names an SF Symbol for every action", () => {
    for (const action of TASK_ACTIONS) {
      expect(action.icon, `${action.key} has no icon`).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)*$/);
    }
  });

  // HIG: "always make context menu items available in the main interface,
  // too" — a context menu is hidden by default, so it is never the only path
  // to what it does. The task detail sheet is that main interface.
  it("mirrors every action in the task detail surface", () => {
    const body = readFileSync(
      resolveInPackage("src/components/board/TaskDetailBody.tsx"),
      "utf8",
    );

    for (const action of TASK_ACTIONS) {
      expect(body, `${action.key} is reachable from the menu only`).toContain(action.mirroredBy);
    }
  });
});

describe("taskAction", () => {
  it("looks an action up by its key", () => {
    for (const action of TASK_ACTIONS) {
      expect(taskAction(action.key)).toBe(action);
    }
  });

  it("types the lookup against the actions that exist", () => {
    const key: TaskActionKey = "delete";

    expect(taskAction(key).destructive).toBe(true);
  });
});
