import { z } from "astro/zod";

/**
 * Build-time coaches for the teams pages and the Kontakt page.
 *
 * The Hub owns club staff (ADR 0008) — the CMS `trainers` collection is on its
 * way out — so the static pages read them from `/public/teams` and join them to
 * a CMS team through the `apiTeamPermanentId` key, exactly as the league name
 * is joined from `/public/standings` (src/lib/team-league.ts). Same failure
 * model as the loaders: callers gate the fetch on a content build, and once it
 * runs any failure — non-200, network error, shape drift — throws and fails the
 * build rather than quietly shipping a page with no coaches on it.
 */

// z.object strips undeclared keys, so what lands in the static HTML is exactly
// what the pages render. `role` stays a plain string: a role added Hub-side
// (Betreuer, Teammanager) must not fail a site build, and nothing here branches
// on the value — the API returns the list already ordered Trainer first.
const staffSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  licence: z.string().nullish(),
  photoUrl: z.string().nullish(),
});

const teamSchema = z.object({
  apiTeamPermanentId: z.number(),
  isOwnClub: z.boolean().nullish(),
  displayOrder: z.number().nullish(),
  // Absent on non-own-club rows — those teams have no staff in the Hub.
  staff: z.array(staffSchema).optional(),
});

const teamsSchema = z.array(teamSchema);

/** One coach as the static pages render them. `photoUrl` is absolute or null. */
export interface SiteStaffMember {
  id: number;
  name: string;
  role: string;
  licence: string | null;
  photoUrl: string | null;
}

/** An own-club team with the coaches attached to its current-season entry. */
export interface SiteTeamStaff {
  apiTeamPermanentId: number;
  displayOrder: number;
  staff: SiteStaffMember[];
}

function toMember(
  member: z.infer<typeof staffSchema>,
  baseUrl: string,
): SiteStaffMember {
  return {
    id: member.id,
    name: `${member.firstName} ${member.lastName}`.trim(),
    role: member.role,
    licence: member.licence ?? null,
    // The API returns the portrait path relative to its own origin so every
    // caller prefixes the base it talks to; the browser loads this one directly.
    photoUrl: member.photoUrl == null ? null : `${baseUrl.replace(/\/$/, "")}${member.photoUrl}`,
  };
}

/** Own-club teams and their staff from `/public/teams`, portrait URLs absolute. */
export async function fetchTeamStaff(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteTeamStaff[]> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/public/teams`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`teams: HTTP ${res.status} for ${url}`);
  return teamsSchema
    .parse(await res.json())
    .filter((team) => team.isOwnClub === true)
    .map((team) => ({
      apiTeamPermanentId: team.apiTeamPermanentId,
      displayOrder: team.displayOrder ?? 0,
      staff: (team.staff ?? []).map((member) => toMember(member, base)),
    }));
}

/** Every team's staff by federation permanent id — the CMS teams' join key. */
export function teamStaffIndex(
  teams: readonly SiteTeamStaff[],
): Map<number, SiteStaffMember[]> {
  return new Map(teams.map((team) => [team.apiTeamPermanentId, team.staff]));
}

/** A team's coaches — empty without a key, without a match, or without staff. */
export function staffFor(
  index: ReadonlyMap<number, SiteStaffMember[]>,
  apiTeamPermanentId: number | null | undefined,
): SiteStaffMember[] {
  if (apiTeamPermanentId == null) return [];
  return index.get(apiTeamPermanentId) ?? [];
}

/**
 * The coach a team page's hero shows, or null when the team has none — the API
 * orders Trainer before Co-Trainer, so the first entry is the head coach. The
 * hero then falls back to the plain "Trainer" title, as it did with the CMS.
 */
export function headCoach(staff: readonly SiteStaffMember[]): SiteStaffMember | null {
  return staff[0] ?? null;
}

/**
 * Every coach of the club for the Kontakt band, teams in display order. One
 * person coaching two teams has a staff row per team entry, but the band is a
 * list of people, so a repeat of the same name is dropped — the first row wins,
 * which is the one on the higher-ordered team.
 */
export function clubCoaches(teams: readonly SiteTeamStaff[]): SiteStaffMember[] {
  const seen = new Set<string>();
  const coaches: SiteStaffMember[] = [];
  for (const team of [...teams].sort((a, b) => a.displayOrder - b.displayOrder)) {
    for (const member of team.staff) {
      const key = member.name.toLocaleLowerCase("de-DE");
      if (seen.has(key)) continue;
      seen.add(key);
      coaches.push(member);
    }
  }
  return coaches;
}
