import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BOARD_SHEET_ROUTES,
  SHEET_ROUTE_PREFIX,
  SHEET_ROUTE_SEGMENT,
  type SheetRouteSpec,
  formSheetOptions,
  searchSheetOptions,
  sheetScreenName,
} from "@/lib/nav/sheet-routes";

/**
 * The route-tree seam for the board's sheets — the utility ones (issue #219)
 * and the two complex ones, task detail and quick create (issue #222).
 *
 * `BOARD_SHEET_ROUTES` is the single declaration of which sheets exist and how
 * they present; `admin/_layout.tsx` renders its `<Stack.Screen>`s straight from
 * it. These assertions keep the table, the files on disk and the layout from
 * drifting apart — a sheet added as a route file but never declared, or
 * declared but presented as a full-screen push, fails here.
 */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP_DIR = path.join(SRC_DIR, "app");
const SHEET_DIR = path.join(APP_DIR, SHEET_ROUTE_SEGMENT);
const ADMIN_LAYOUT = path.join(APP_DIR, "admin/_layout.tsx");

/** One declared sheet by name — an undeclared name is a failure, not `undefined`. */
function sheetRoute(name: string): SheetRouteSpec {
  const spec = BOARD_SHEET_ROUTES.find((route) => route.name === name);
  if (!spec) throw new Error(`no sheet route declared for "${name}"`);
  return spec;
}

describe("board sheet routes", () => {
  it("declares every sheet the board opens", () => {
    expect(BOARD_SHEET_ROUTES.map((route) => route.name).sort()).toEqual(
      [
        "add-column",
        "assignee-filter",
        "assignees",
        "board-settings",
        "column-settings",
        "due",
        "move-to",
        "priority",
        "quick-create",
        "sort",
        "task-detail",
      ].sort(),
    );
  });

  it("backs every declared sheet with a route file", () => {
    for (const route of BOARD_SHEET_ROUTES) {
      const file = path.join(SHEET_DIR, `${route.name}.tsx`);
      expect(existsSync(file), `${route.name} has no route file at ${file}`).toBe(true);
    }
  });

  it("declares every route file that sits in the sheet directory", () => {
    const declared = new Set(BOARD_SHEET_ROUTES.map((route) => route.name));
    for (const entry of readdirSync(SHEET_DIR)) {
      const name = entry.replace(/\.tsx$/, "");
      expect(declared.has(name), `${entry} is a sheet route but is not declared`).toBe(true);
    }
  });

  // Everything the acceptance criteria ask for at once: a *form* sheet (not a
  // push, not a full-screen modal), a visible grabber, and a swipe-down that
  // dismisses it.
  it("presents every sheet as a swipe-dismissible form sheet with a grabber", () => {
    for (const route of BOARD_SHEET_ROUTES) {
      const options = formSheetOptions(route);
      expect(options.presentation, route.name).toBe("formSheet");
      expect(options.sheetGrabberVisible, route.name).toBe(true);
      expect(options.gestureEnabled, route.name).toBe(true);
      // The sheets draw their own titles in content; a native header would
      // eat the height that `fitToContents` exists to save.
      expect(options.headerShown, route.name).toBe(false);
    }
  });

  it("passes each sheet's declared detents through to the native option", () => {
    for (const route of BOARD_SHEET_ROUTES) {
      expect(formSheetOptions(route).sheetAllowedDetents, route.name).toEqual(route.detents);
    }
  });

  // Three sizes, no more: content-sized, half-then-full, and full. A fourth
  // one-off value is the smell that a sheet is drawing the wrong thing.
  it("draws detents from the settled size vocabulary", () => {
    for (const route of BOARD_SHEET_ROUTES) {
      expect(["fitToContents", [0.5, 1], [1]], route.name).toContainEqual(route.detents);
    }
  });

  // The due sheet is the one the ticket calls out by name: it used to be a
  // fixed 75% panel with the inline picker floating in it.
  it("sizes the due-date sheet to its inline picker", () => {
    expect(sheetRoute("due").detents).toBe("fitToContents");
  });

  // #222. Task detail is a scrolling form — checklist and comments outgrow
  // half a screen as soon as a task has a few of either — so it opens at
  // medium and drags to large. Scrolling to the top edge hands the drag to the
  // sheet, which is how iOS grows a sheet the user is already reading in.
  it("opens task detail at half height and lets it grow to full", () => {
    const detail = sheetRoute("task-detail");

    expect(detail.detents).toEqual([0.5, 1]);
    expect(formSheetOptions(detail).sheetExpandsWhenScrolledToEdge).toBe(true);
  });

  // #222. Quick create focuses its title field on open, so the keyboard is up
  // for the sheet's whole life; anything shorter than full height would leave
  // the rest of the form underneath it.
  it("presents quick create at full height", () => {
    expect(sheetRoute("quick-create").detents).toEqual([1]);
  });

  it("opens every sheet at its smallest detent", () => {
    for (const route of BOARD_SHEET_ROUTES) {
      expect(formSheetOptions(route).sheetInitialDetentIndex, route.name).toBe(0);
    }
  });

  // The admin layout names screens relative to itself, while the `openX`
  // helpers push absolute paths. Both are derived from the same segment, so a
  // rename cannot move one without the other.
  it("names each screen relative to the admin layout", () => {
    expect(sheetScreenName({ name: "sort", detents: "fitToContents" })).toBe("boards/sheets/sort");
    for (const route of BOARD_SHEET_ROUTES) {
      expect(`${SHEET_ROUTE_PREFIX}/${route.name}`).toBe(
        `/admin/${sheetScreenName(route)}`,
      );
    }
  });

  it("renders the admin stack's sheet screens from the table", () => {
    const layout = readFileSync(ADMIN_LAYOUT, "utf8");
    expect(layout).toContain("BOARD_SHEET_ROUTES");
    expect(layout).toContain("formSheetOptions");
    // A hand-written <Stack.Screen name="boards/sheets/..."> would leave the
    // table describing a presentation nothing reads.
    expect(layout).not.toMatch(/name="boards\/sheets\//);
  });
});

/**
 * The second sheet shape (issue #223): a form sheet that keeps its native
 * header, because the header is where its search field belongs.
 */
describe("searchSheetOptions", () => {
  const options = searchSheetOptions({ tintColor: "#ffffff" });

  it("presents as a swipe-dismissible form sheet with a grabber", () => {
    expect(options.presentation).toBe("formSheet");
    expect(options.gestureEnabled).toBe(true);
    expect(options.sheetGrabberVisible).toBe(true);
  });

  // Unlike the board's sheets, which draw their titles in content and hide the
  // header to save the height `fitToContents` exists for.
  it("keeps the native header, which is what carries the search field", () => {
    expect(options.headerShown).toBe(true);
  });

  it("tints the header with the app's own foreground colour", () => {
    // The app's theme can be forced light or dark independently of the system
    // appearance, so the header cannot be left to pick its own label colour.
    expect(options.headerTintColor).toBe("#ffffff");
  });

  // The size vocabulary's `[1]`, for exactly the reason it was written down:
  // the keyboard is up for most of this sheet's life.
  it("opens full height, the only detent a search-over-a-list sheet can use", () => {
    expect(options.sheetAllowedDetents).toEqual([1]);
    expect(options.sheetInitialDetentIndex).toBe(0);
  });

  // The title depends on which slot is being filled, so the screen declares it
  // inline; the layout would have to guess.
  it("leaves the title to the screen", () => {
    expect(options.title).toBeUndefined();
    expect(options.headerTitle).toBeUndefined();
  });
});
