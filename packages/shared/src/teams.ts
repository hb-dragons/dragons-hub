/**
 * What a club team is called on screen: the season's custom name if the club
 * gave it one, else the federation's short name, else its full name.
 *
 * This lives in `@dragons/shared` because two sides have to spell it the same
 * way. The admin match editor writes this string into
 * `matches.anschreiber` / `zeitnehmer` / `shotclock` — the Kampfgericht columns
 * hold a name, not an id — and the referee Einsatz reader matches that string
 * back to a team entry to find its contacts (#313). Two private copies of the
 * expression would drift the moment either side gained a fallback.
 *
 * A blank string counts as absent, not as a name: `teamUpdateBodySchema`
 * accepts `customName: ""`, and a `??` chain would then render — and try to
 * match — an empty name.
 */
export function teamDisplayName(team: {
  name: string;
  nameShort: string | null;
  customName: string | null;
}): string {
  return team.customName?.trim() || team.nameShort?.trim() || team.name;
}

export interface OwnClubTeam {
  /** Team entry id (per season) — the id PATCH /admin/teams/:id addresses. */
  id: number;
  /** Squad id (teams.id), stable across seasons. */
  teamId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  /** False when the connected league is no longer tracked — UI shows a warning. */
  leagueTracked: boolean;
  linkSource: "seeded" | "manual";
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

export interface TeamReorderItem {
  id: number;
  name: string;
  displayOrder: number;
}

/** The roles a Team staff member can hold. Widen when Betreuer/Teammanager arrive (ADR 0008). */
export const TEAM_STAFF_ROLES = ["trainer", "co_trainer"] as const;
export type TeamStaffRole = (typeof TEAM_STAFF_ROLES)[number];

/**
 * A staff person: the human the club holds contact data on (ADR 0009). Exists
 * once regardless of how many teams they are attached to — the attachment is a
 * {@link TeamStaffMember}, which carries only the role and the flag.
 */
export interface StaffPerson {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  licence: string | null;
  /**
   * API path of the portrait, or `null`. Relative to the API base so each
   * caller prefixes its own origin, and stamped with the stored object name so
   * replacing a portrait busts the cache the image route sets on the old one.
   */
  photoUrl: string | null;
}

/** One team a person is attached to, as the staff pool lists it. */
export interface StaffPersonAssignment {
  /** The `team_staff` id — what the team-scoped endpoints address. */
  id: number;
  teamEntryId: number;
  teamName: string;
  role: TeamStaffRole;
  refereeContact: boolean;
}

/** A pool entry: the person plus the teams they hold this season. */
export interface StaffPersonWithAssignments extends StaffPerson {
  assignments: StaffPersonAssignment[];
}

/**
 * What a coach reads and edits about themselves through `/me/staff` (#315):
 * their own person record plus the teams they are attached to, which they see
 * but do not change. The portrait is deliberately absent — it is served from an
 * admin-gated route, so a coach could not fetch the URL.
 */
export type MyStaffProfile = Omit<StaffPersonWithAssignments, "photoUrl">;

/**
 * One staff member of a team entry, as the admin endpoints return them: the
 * assignment joined to its person, so the name and contact fields are the
 * person's and are shared by every team that member is attached to.
 */
export interface TeamStaffMember {
  /** The assignment id. The person is {@link personId}. */
  id: number;
  teamEntryId: number;
  personId: number;
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  phone: string | null;
  email: string | null;
  licence: string | null;
  /**
   * API path of the portrait, or `null` when the member has none. Relative to
   * the API base so each caller prefixes its own origin, and stamped with the
   * stored object name so replacing a portrait busts the cache the image route
   * sets on the previous one.
   */
  photoUrl: string | null;
  /** Marks the member referees are pointed at as the team contact. */
  refereeContact: boolean;
}

/**
 * A staff member as the public team list exposes them. Deliberately a subset of
 * {@link TeamStaffMember}: the Website is a public page, so phone and email
 * never leave the Hub through this endpoint (`team-list.service.ts` selects the
 * columns explicitly, and a test asserts neither value appears in the payload).
 */
export interface PublicTeamStaff {
  /** The assignment id — what `/public/staff/:id/photo` is keyed by. */
  id: number;
  /** The person behind the assignment, so a consumer can dedupe across teams. */
  personId: number;
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  licence: string | null;
  /** Public API path of the portrait, or `null`. Relative to the API base. */
  photoUrl: string | null;
}
