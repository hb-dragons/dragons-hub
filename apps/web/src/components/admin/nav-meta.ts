/**
 * Web presentation for the shared nav surfaces: which URL each one points at and
 * which message key labels it.
 *
 * Kept apart from `app-sidebar.tsx` so it stays plain data — the sidebar pulls in
 * next-intl's client navigation, which a node-environment test cannot import.
 * `app-sidebar.test.tsx` reads this module to assert every surface is actually
 * linked somewhere.
 */

// next-intl's typed `t()` needs literal message keys (not `string`) to resolve
// the parameterless overload, so the label keys are typed as literal unions.
export type GroupLabelKey =
  | "nav.groupLeague"
  | "nav.groupOperations"
  | "nav.groupSocial"
  | "nav.groupNotifications"
  | "nav.groupSystem";

export type SurfaceLabelKey =
  | "nav.matches"
  | "nav.standings"
  | "nav.teams"
  | "nav.staffPeople"
  | "nav.board"
  | "nav.bookings"
  | "nav.venues"
  | "nav.broadcast"
  | "nav.createPost"
  | "nav.notificationCenter"
  | "nav.watchRules"
  | "nav.channels"
  | "nav.domainEvents"
  | "nav.pushTest"
  | "nav.sync"
  | "nav.seasons"
  | "nav.settings"
  | "nav.users";

/** Surfaces that deliberately have no web nav entry, with the reason. */
export const WEB_ONLY_EXEMPT_SURFACES: Record<string, string> = {
  officiating:
    "native-only; on web the Referees link is a top-level item with its own gate",
};

/**
 * id -> web presentation for the grouped surfaces.
 *
 * A surface missing from here renders no link at all — the sidebar skips it
 * without a word. That is how `/admin/seasons` shipped reachable only by typing
 * the URL. `app-sidebar.test.tsx` now fails on any surface that is neither
 * listed here nor recorded in `WEB_ONLY_EXEMPT_SURFACES`.
 */
export const SURFACE_META: Record<string, { href: string; labelKey: SurfaceLabelKey }> = {
  matches: { href: "/admin/matches", labelKey: "nav.matches" },
  standings: { href: "/admin/standings", labelKey: "nav.standings" },
  teams: { href: "/admin/teams", labelKey: "nav.teams" },
  staffPeople: { href: "/admin/staff", labelKey: "nav.staffPeople" },
  boards: { href: "/admin/boards", labelKey: "nav.board" },
  bookings: { href: "/admin/bookings", labelKey: "nav.bookings" },
  venues: { href: "/admin/venues", labelKey: "nav.venues" },
  broadcast: { href: "/admin/broadcast", labelKey: "nav.broadcast" },
  createPost: { href: "/admin/social/create", labelKey: "nav.createPost" },
  notifications: { href: "/admin/notifications", labelKey: "nav.notificationCenter" },
  watchRules: { href: "/admin/notifications/rules", labelKey: "nav.watchRules" },
  channels: { href: "/admin/notifications/channels", labelKey: "nav.channels" },
  domainEvents: { href: "/admin/notifications/events", labelKey: "nav.domainEvents" },
  pushTest: { href: "/admin/settings/notifications", labelKey: "nav.pushTest" },
  sync: { href: "/admin/sync", labelKey: "nav.sync" },
  seasons: { href: "/admin/seasons", labelKey: "nav.seasons" },
  settings: { href: "/admin/settings", labelKey: "nav.settings" },
  users: { href: "/admin/users", labelKey: "nav.users" },
};
