import type { NativeStackNavigationOptions } from "expo-router";

/**
 * The board's utility sheets, as routes (issue #219).
 *
 * ## Why routes at all
 *
 * These were `<BottomSheetModal>`s mounted next to the board screen and opened
 * through imperative refs. As native form sheets they get the system's
 * grabber, detent drag and swipe-to-dismiss for free, and — because they are
 * routes — a back gesture, a deep-linkable address and a presentation that is
 * declared once instead of re-derived from percentage snap points.
 *
 * ## Conventions the follow-on sheet tickets inherit
 *
 * **Placement.** Every board sheet is a file under `app/admin/boards/sheets/`,
 * so it is a child of the same stack as the board screen and presents over it.
 * The segment is a real directory, not a `(sheets)` route group: a group adds
 * no URL segment, which would put `sort` and friends at `/admin/boards/sort`
 * where they compete with `/admin/boards/[id]` for the same shape of path.
 *
 * **Params.** Sheets take scalars only — ids and current values — because
 * route params are strings. Anything list-shaped that the sheet also needs
 * (a board's columns, its task counts, the user directory) the sheet fetches
 * for itself through the same SWR key the board screen uses, so the cache is
 * already warm.
 *
 * **Results.** A sheet either *owns a mutation* or *returns a value*, never
 * both:
 *  - Owning sheets (add column, board settings, column settings, move to) call
 *    the mutation hook themselves and close. No result param.
 *  - Returning sheets (sort, priority, due, assignees, assignee filter) get a
 *    `result` token from `lib/nav/sheet-result.ts`, deliver the picked value
 *    through it, and let the opening screen decide what to do. The token is
 *    released on unmount so a swipe-dismiss leaks nothing.
 *
 * **Detents.** Three sizes, listed with `SheetDetents` below. A sheet that
 * wants a fourth is usually a sheet that should be a screen.
 */

/**
 * Allowed heights for a sheet.
 *
 * - `"fitToContents"` — intrinsically sized content: a short option list or a
 *   single control. The system measures it; nothing here guesses a percentage.
 * - `[0.5, 1]` — content that can outgrow half the screen (a column list, a
 *   settings form). Opens at half, drags to full.
 * - `[1]` — a search field over a list: the keyboard is up for most of the
 *   sheet's life, so anything shorter than full height is unusable.
 */
type SheetDetents = "fitToContents" | readonly number[];

const FIT_TO_CONTENTS = "fitToContents" as const;
const HALF_THEN_FULL = [0.5, 1] as const;
const FULL = [1] as const;

export interface SheetRouteSpec {
  /** File name under the sheet directory, without extension. */
  name: string;
  detents: SheetDetents;
}

/** Sheet directory relative to the admin layout, which names screens that way. */
const SHEET_DIR_UNDER_ADMIN = "boards/sheets";

/** Route directory holding the board sheets, relative to `src/app`. */
export const SHEET_ROUTE_SEGMENT = `admin/${SHEET_DIR_UNDER_ADMIN}`;

/** Path prefix the `openX` helpers in `board-sheets.ts` push to. */
export const SHEET_ROUTE_PREFIX = `/${SHEET_ROUTE_SEGMENT}`;

export const BOARD_SHEET_ROUTES: readonly SheetRouteSpec[] = [
  { name: "sort", detents: FIT_TO_CONTENTS },
  { name: "priority", detents: FIT_TO_CONTENTS },
  { name: "due", detents: FIT_TO_CONTENTS },
  { name: "add-column", detents: FIT_TO_CONTENTS },
  { name: "move-to", detents: HALF_THEN_FULL },
  { name: "board-settings", detents: HALF_THEN_FULL },
  { name: "column-settings", detents: HALF_THEN_FULL },
  { name: "assignees", detents: FULL },
  { name: "assignee-filter", detents: FULL },
];

/** The expo-router screen name for a sheet, as `admin/_layout.tsx` names it. */
export function sheetScreenName(spec: SheetRouteSpec): string {
  return `${SHEET_DIR_UNDER_ADMIN}/${spec.name}`;
}

/**
 * Presentation for one sheet route. Shared verbatim across all of them apart
 * from the detents, so "is this sheet configured like the others" is a
 * question about one function rather than nine call sites.
 */
export function formSheetOptions(spec: SheetRouteSpec): NativeStackNavigationOptions {
  return {
    presentation: "formSheet",
    // The sheets draw their own titles; a native header would eat the height
    // `fitToContents` exists to save, and would push the grabber off-screen.
    headerShown: false,
    // Swipe-down dismiss. Every sheet here is cancellable — the destructive
    // paths behind them go through their own confirmation alert.
    gestureEnabled: true,
    sheetGrabberVisible: true,
    sheetAllowedDetents: spec.detents as NativeStackNavigationOptions["sheetAllowedDetents"],
    sheetExpandsWhenScrolledToEdge: true,
    sheetInitialDetentIndex: 0,
  };
}
