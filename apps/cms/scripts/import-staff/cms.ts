/**
 * The CMS side of the one-off staff import: the two documents it reads and the
 * paginated Payload REST call that fetches them.
 *
 * Deliberately narrow hand-written shapes rather than `src/payload-types.ts`.
 * What arrives here is JSON off the wire from a *running* CMS, which may be a
 * release behind the generated types, and every field this script touches is
 * treated as possibly-absent anyway.
 *
 * Reads `CMS_URL` and `CMS_API_TOKEN`.
 */
import { requireEnv } from "./env";

/** A media doc as the portrait pass needs it: where the bytes are and what they are. */
export interface CmsMedia {
  id: number;
  /** Relative (`/api/media/file/…`) when Payload serves the bytes, absolute when the bucket is public. */
  url?: string | null;
  mimeType?: string | null;
}

export interface CmsPerson {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** A number when the response was not populated deeply enough. */
  image?: number | CmsMedia | null;
}

export interface CmsTrainer {
  id: number;
  /** A number when the response was not populated deeply enough. */
  person?: number | CmsPerson | null;
  licence?: string | null;
  email?: string | null;
  /** The trainer-specific portrait; the person's image is the fallback. */
  image?: number | CmsMedia | null;
}

export interface CmsTeam {
  id: number;
  name: string;
  slug: string;
  apiTeamPermanentId?: number | null;
  trainers?: (number | CmsTrainer)[] | null;
}

const PAGE_SIZE = 100;

/** Exported for tests: teams with their trainers, each trainer's person, and both images. */
export function buildTeamsUrl(base: string, page: number): string {
  const url = new URL(`${base.replace(/\/$/, "")}/api/teams`);
  // The depth is the whole point of this call: depth=1 populates `trainers`
  // but leaves `trainer.person` a bare id, and the person holds the name;
  // depth=2 reaches the person and the trainer's own image; the person's
  // image — the portrait fallback the `--portraits` pass needs — is one
  // level further still.
  url.searchParams.set("depth", "3");
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
    const url = buildTeamsUrl(requireEnv("CMS_URL"), page);
    const res = await fetch(url, {
      headers: { Authorization: `users API-Key ${requireEnv("CMS_API_TOKEN")}` },
    });
    if (!res.ok) throw new Error(`cms: HTTP ${res.status} for ${url}`);
    const body = (await res.json()) as { docs: CmsTeam[]; totalPages: unknown };
    teams.push(...body.docs);
    if (isLastPage(page, body.totalPages)) break;
  }
  return teams;
}

/**
 * Where a media doc's bytes are fetched from. Payload hands out a relative
 * `/api/media/file/…` path when it serves the bytes itself (a private media
 * bucket, or local disk in dev) and an absolute `storage.googleapis.com` URL
 * when the bucket is public — the same rule the Website's `mediaUrl` applies.
 */
export function mediaUrl(url: string): string {
  if (isAbsoluteUrl(url)) return url;
  return `${requireEnv("CMS_URL").replace(/\/$/, "")}${url}`;
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

export async function downloadMedia(url: string): Promise<Buffer> {
  const absolute = mediaUrl(url);
  // The API key only means something to the CMS. A bucket URL is public by
  // construction, and an Authorization header GCS cannot parse is a 401.
  const headers: Record<string, string> = isAbsoluteUrl(url)
    ? {}
    : { Authorization: `users API-Key ${requireEnv("CMS_API_TOKEN")}` };
  const res = await fetch(absolute, { headers });
  if (!res.ok) throw new Error(`cms download: HTTP ${res.status} for ${absolute}`);
  return Buffer.from(await res.arrayBuffer());
}
