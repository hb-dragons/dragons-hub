import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import {
  BOARD_ACTIONS,
  BOARD_OVERFLOW_ACTIONS,
  BOARD_TOOLBAR_ACTIONS,
} from "@/lib/board/board-actions";
import { ICONS } from "@/lib/ui/icons";
import { resolveInPackage } from "../../../test/source-tree";

/** The string a bundle holds at a dotted key path, or undefined. */
function lookup(bundle: object, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
}

describe("BOARD_ACTIONS", () => {
  it("names each action once", () => {
    const keys = BOARD_ACTIONS.map((action) => action.key);
    expect(new Set(keys).size, "two actions share a key").toBe(keys.length);
  });

  it("splits into the toolbar's own items and the overflow menu's, with nothing lost", () => {
    expect([...BOARD_TOOLBAR_ACTIONS, ...BOARD_OVERFLOW_ACTIONS].map((a) => a.key).sort()).toEqual(
      BOARD_ACTIONS.map((a) => a.key).sort(),
    );
    expect(BOARD_TOOLBAR_ACTIONS.length).toBeGreaterThan(0);
    expect(BOARD_OVERFLOW_ACTIONS.length).toBeGreaterThan(0);
  });

  /**
   * The FAB decision (#224), written where it fails if someone reverts it:
   * creating a task is a toolbar item, not a floating button over the content
   * layer and not a line in the overflow menu. It is the board's primary
   * action, so it stays one tap away.
   */
  it("gives creating a task its own toolbar item", () => {
    expect(BOARD_TOOLBAR_ACTIONS.map((a) => a.key)).toContain("create");
  });

  // The HIG asks menus to keep their items few. Four is already generous for a
  // board whose filters, columns and sort all have visible controls too; a
  // fifth is a prompt to ask whether the action belongs on the screen instead.
  it("keeps the overflow menu short", () => {
    expect(BOARD_OVERFLOW_ACTIONS.length).toBeLessThanOrEqual(4);
  });

  // The toolbar draws its own symbol rather than going through `<Icon>`, but it
  // draws it from the same vocabulary (#221) — a toolbar item naming a raw SF
  // Symbol would be the second place the app decides what "sort" looks like.
  it("names every icon from the app's icon vocabulary", () => {
    for (const action of BOARD_ACTIONS) {
      expect(Object.keys(ICONS), `${action.key} names no known role`).toContain(action.icon);
    }
  });

  it.each(BOARD_ACTIONS)("localizes $key in both bundles", ({ labelKey }) => {
    expect(typeof lookup(en, labelKey), `${labelKey} missing from en`).toBe("string");
    expect(typeof lookup(de, labelKey), `${labelKey} missing from de`).toBe("string");
  });

  // Same rule as `task-actions.test.ts`: one spelling of an action's label. A
  // second site translating the same key is a label that can be changed in one
  // place and stay stale in the other.
  it("is the only site naming the board's chrome labels", () => {
    const board = readFileSync(resolveInPackage("src/app/admin/boards/[id].tsx"), "utf8");
    for (const { labelKey } of BOARD_ACTIONS) {
      expect(board, `${labelKey} is spelled in the board screen too`).not.toContain(
        `"${labelKey}"`,
      );
    }
  });
});
