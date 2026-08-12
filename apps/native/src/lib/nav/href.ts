import type { Href } from "expo-router";

/**
 * The app's routes as typed hrefs (#217).
 *
 * expo-router's `Href` is only a union of the app's real routes when the
 * generated route declarations are in scope (`.expo/types/router.d.ts`, from
 * `experiments.typedRoutes`). That file is gitignored, so the package's
 * `typecheck` script regenerates it before running `tsc` — and the assertion
 * below fails the build if it ever silently does not, because without it
 * `Href` degrades to `string` and every href check in the app becomes vacuous
 * rather than absent, which is the worse of the two failures.
 */
type RouteTypesMustBeGenerated<T extends true> = T;
type _RouteTypesAreGenerated = RouteTypesMustBeGenerated<
  string extends Extract<Href, string>
    ? "expo-router route types are missing: run `pnpm --filter @dragons/native typecheck`, which regenerates .expo/types/router.d.ts first"
    : true
>;

/**
 * The path form of a typed href, i.e. `Href` minus its `{ pathname, params }`
 * variant. It is what a route table entry or a data field carries: a plain
 * string at runtime, still checked against the app's routes at compile time.
 */
export type RouteHref = Extract<Href, string>;

/**
 * Every route the app declares, keyed by its expo-router pattern, each with a
 * builder that turns matched dynamic segments into a typed href.
 *
 * The builders exist because a route is only compile-checked where the literal
 * is written: `\`/game/${id}\`` is checked against the generated union,
 * `"/" + segments.join("/")` is not. `nav/routes.test.ts` diffs these keys
 * against the route files on disk in both directions, so a screen added
 * without an entry here (or an entry left behind by a deleted screen) fails
 * the build.
 */
export const APP_ROUTES: Record<string, (...params: string[]) => RouteHref> = {
  "/": () => "/",
  "/schedule": () => "/schedule",
  "/standings": () => "/standings",
  "/teams": () => "/teams",
  "/today": () => "/today",
  "/officiating": () => "/officiating",
  "/league-tables": () => "/league-tables",
  "/profile": () => "/profile",
  "/assistant": () => "/assistant",
  "/sign-in": () => "/sign-in",
  "/admin/boards": () => "/admin/boards",
  "/referee-assign": () => "/referee-assign",
  "/+not-found": () => "/+not-found",
  // The board's utility sheets (#219). They are routes, so they are part of the
  // inventory this table diffs against disk; `board-sheets.ts` is what screens
  // actually open them through.
  "/admin/boards/sheets/sort": () => "/admin/boards/sheets/sort",
  "/admin/boards/sheets/priority": () => "/admin/boards/sheets/priority",
  "/admin/boards/sheets/due": () => "/admin/boards/sheets/due",
  "/admin/boards/sheets/add-column": () => "/admin/boards/sheets/add-column",
  "/admin/boards/sheets/move-to": () => "/admin/boards/sheets/move-to",
  "/admin/boards/sheets/board-settings": () => "/admin/boards/sheets/board-settings",
  "/admin/boards/sheets/column-settings": () => "/admin/boards/sheets/column-settings",
  "/admin/boards/sheets/assignees": () => "/admin/boards/sheets/assignees",
  "/admin/boards/sheets/assignee-filter": () => "/admin/boards/sheets/assignee-filter",
  // The board's two complex sheets (#222).
  "/admin/boards/sheets/task-detail": () => "/admin/boards/sheets/task-detail",
  "/admin/boards/sheets/quick-create": () => "/admin/boards/sheets/quick-create",
  // The board list's own sheet, which replaced the last JS bottom sheet (#225).
  "/admin/boards/sheets/create-board": () => "/admin/boards/sheets/create-board",
  "/game/[id]": (id: string) => `/game/${id}`,
  "/team/[id]": (id: string) => `/team/${id}`,
  "/h2h/[teamApiId]": (teamApiId: string) => `/h2h/${teamApiId}`,
  "/referee-game/[id]": (id: string) => `/referee-game/${id}`,
  "/admin/boards/[id]": (id: string) => `/admin/boards/${id}`,
};

/** Where an unmatched link lands — the screen expo-router would show anyway. */
export const NOT_FOUND_ROUTE: RouteHref = "/+not-found";

/** `(tabs)` and friends are grouping directories, not URL segments. */
const isGroupSegment = (segment: string): boolean => /^\(.+\)$/.test(segment);

const isDynamicSegment = (segment: string): boolean => /^\[.+\]$/.test(segment);

/**
 * The segments of an in-app path: query string and hash dropped, route-group
 * directories transparent, empty segments collapsed.
 *
 * Exported so the deep-link auth gate (`push/handler.ts`) reads a path the
 * same way the resolver does — a gate that disagreed with the resolver about
 * where a path's first segment starts would gate the wrong screen.
 */
export function linkSegments(link: string): string[] {
  return link
    .split("?")[0]!
    .split("#")[0]!
    .split("/")
    .filter((segment) => segment.length > 0 && !isGroupSegment(segment));
}

const PATTERNS = Object.entries(APP_ROUTES).map(([pattern, build]) => ({
  segments: pattern.split("/").filter((segment) => segment.length > 0),
  build,
}));

/**
 * The values a pattern's dynamic segments take for this path, in order, or
 * `null` when the pattern does not describe the path at all.
 */
function matchParams(pattern: string[], segments: string[]): string[] | null {
  if (pattern.length !== segments.length) return null;
  const params: string[] = [];
  for (const [index, expected] of pattern.entries()) {
    const actual = segments[index]!;
    if (isDynamicSegment(expected)) params.push(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

/**
 * Turn a path that arrived from outside the type system — a notification
 * payload, which is remote input — into an href the router is known to have a
 * screen for, or `null`.
 *
 * A query string or hash is dropped: the path is what selects the screen, and
 * no screen reads search params. Appending the rest would mean concatenating
 * an unchecked string onto a typed href, which defeats the point. Route params
 * belong in an `{ pathname, params }` entry above if a screen ever needs them.
 */
export function resolveDeepLink(link: string): RouteHref | null {
  if (!link.startsWith("/")) return null;

  const segments = linkSegments(link);

  for (const { segments: pattern, build } of PATTERNS) {
    const params = matchParams(pattern, segments);
    if (params) return build(...params);
  }
  return null;
}
