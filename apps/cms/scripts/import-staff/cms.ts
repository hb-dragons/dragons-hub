/**
 * The CMS side of the one-off staff import: the two documents it reads and the
 * paginated Payload REST call that fetches them.
 *
 * Deliberately narrow hand-written shapes rather than `src/payload-types.ts`.
 * What arrives here is JSON off the wire from a *running* CMS, which may be a
 * release behind the generated types, and every field this script touches is
 * treated as possibly-absent anyway.
 */

export interface CmsPerson {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CmsTrainer {
  id: number;
  /** A number when the response was not populated deeply enough. */
  person?: number | CmsPerson | null;
  licence?: string | null;
  email?: string | null;
}

export interface CmsTeam {
  id: number;
  name: string;
  slug: string;
  apiTeamPermanentId?: number | null;
  trainers?: (number | CmsTrainer)[] | null;
}

function env(name: "CMS_URL" | "CMS_API_TOKEN"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

const PAGE_SIZE = 100;

/** Exported for tests: teams with their trainers *and* each trainer's person. */
export function buildTeamsUrl(base: string, page: number): string {
  const url = new URL(`${base.replace(/\/$/, "")}/api/teams`);
  // depth=2 is the whole point of this call: depth=1 populates `trainers` but
  // leaves `trainer.person` a bare id, and the person holds the name.
  url.searchParams.set("depth", "2");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  return url.toString();
}

/**
 * Exported for tests, same reason as the Strapi importer's isLastPage: a
 * response without a numeric totalPages would make `page >= undefined` false
 * forever and spin the loop against production. Fail loudly instead.
 */
export function isLastPage(page: number, totalPages: unknown): boolean {
  if (typeof totalPages !== "number" || !Number.isFinite(totalPages)) {
    throw new Error(`cms: teams page ${page} has a non-numeric totalPages (${JSON.stringify(totalPages)})`);
  }
  return page >= totalPages;
}

export async function fetchTeams(): Promise<CmsTeam[]> {
  const teams: CmsTeam[] = [];
  for (let page = 1; ; page += 1) {
    const url = buildTeamsUrl(env("CMS_URL"), page);
    const res = await fetch(url, {
      headers: { Authorization: `users API-Key ${env("CMS_API_TOKEN")}` },
    });
    if (!res.ok) throw new Error(`cms: HTTP ${res.status} for ${url}`);
    const body = (await res.json()) as { docs: CmsTeam[]; totalPages: unknown };
    teams.push(...body.docs);
    if (isLastPage(page, body.totalPages)) break;
  }
  return teams;
}
