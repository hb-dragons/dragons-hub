import type { TeamStaffRole } from "@dragons/shared";

import type { CmsMedia, CmsPerson, CmsTeam, CmsTrainer } from "./cms";
import { isPortraitContentType, type PortraitContentType } from "./portrait-rules";

/** One `team_staff` row the import intends to write. */
export interface PlannedStaffRow {
  teamEntryId: number;
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  phone: string | null;
  email: string | null;
  licence: string | null;
}

export interface StaffPlan {
  rows: PlannedStaffRow[];
  /** Notes for the run log — a trainer the import could not name. */
  skipped: string[];
}

/** A `team_staff` row the Hub already holds, as the portrait pass needs it. */
export interface ExistingStaff {
  id: number;
  teamEntryId: number;
  firstName: string;
  lastName: string;
  photoFilename: string | null;
}

/** One portrait the `--portraits` pass intends to copy from the CMS onto a staff row. */
export interface PlannedPortrait {
  staffId: number;
  teamEntryId: number;
  name: string;
  /** The CMS media `url` as it arrived — relative or absolute, resolved at download time. */
  sourceUrl: string;
  contentType: PortraitContentType;
}

export interface PortraitPlan {
  copies: PlannedPortrait[];
  /** Notes for the run log — a trainer whose portrait cannot be copied. */
  skipped: string[];
  /** Rows that already carry a portrait: left alone, so a rerun is a no-op for them. */
  alreadyThere: number;
}

/**
 * CMS people carry one `name` field; `team_staff` has two. Split on the *last*
 * space, so "Anna Lena von Berg" keeps everything but "Berg" as the first name.
 * A single token becomes the first name with an empty last name: a one-word
 * entry in the CMS is a given name or a nickname, never a surname.
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? (parts.pop() as string) : "";
  return { firstName: parts.join(" "), lastName };
}

/**
 * The idempotency key: an entry plus a name — deliberately not the role, so a
 * coach an admin has already entered as `co_trainer` is left alone rather than
 * gaining a second row under the CMS's flat "Trainer".
 *
 * Re-running the import must not
 * add a second copy of someone it already imported, and nothing in the CMS
 * survives the trip that could act as a stable foreign id — the Hub row is
 * editable afterwards, so matching on anything but the name would resurrect
 * a staff member an admin had renamed.
 */
export function staffKey(row: { teamEntryId: number; firstName: string; lastName: string }): string {
  return [row.teamEntryId, row.firstName.trim().toLowerCase(), row.lastName.trim().toLowerCase()].join(
    "|",
  );
}

/** A blank CMS text field means "unset", not an empty value. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** A relation the CMS returned as a bare id was fetched too shallowly to use. */
function requireDoc<T>(value: number | T, what: string): T {
  if (typeof value === "number") {
    throw new Error(`import-staff: ${what} arrived as an id — the CMS read needs depth=3`);
  }
  return value;
}

/** A trainer of a CMS team, matched to the active season's team entry and named. */
interface MatchedCmsTrainer {
  teamSlug: string;
  teamEntryId: number;
  trainer: CmsTrainer;
  person: CmsPerson | null;
  name: string;
  firstName: string;
  lastName: string;
}

interface CmsTrainerMatches {
  /** One per (entry, name): a name repeated on the same team is kept once. */
  matched: MatchedCmsTrainer[];
  /** Notes for the run log — a trainer neither pass can name. */
  skipped: string[];
}

/**
 * Match every CMS team to its team entry, resolve each trainer's person and
 * drop what cannot be named or is a repeat — the walk both passes share, so
 * the portrait pass lands on exactly the rows the staff pass wrote.
 *
 * Throws rather than skipping whenever a team *has* trainers but cannot be
 * matched: a silently dropped team is a team whose coaches never appear in the
 * app, which is exactly the failure this one-off run cannot leave behind. Every
 * unmatched team is named in one error — a draft team included, since the API
 * key the script uses sees drafts an anonymous reader does not.
 */
function matchCmsTrainers(
  teams: CmsTeam[],
  entryIdByPermanentId: Map<number, number>,
): CmsTrainerMatches {
  const matched: MatchedCmsTrainer[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const team of teams) {
    const trainers = team.trainers ?? [];
    if (trainers.length === 0) continue;

    const permanentId = team.apiTeamPermanentId;
    if (permanentId === null || permanentId === undefined) {
      unmatched.push(
        `"${team.slug}" carries ${trainers.length} trainer(s) but no apiTeamPermanentId`,
      );
      continue;
    }
    const teamEntryId = entryIdByPermanentId.get(permanentId);
    if (teamEntryId === undefined) {
      unmatched.push(
        `"${team.slug}" (apiTeamPermanentId ${permanentId}) has no team entry in the active season`,
      );
      continue;
    }

    for (const entry of trainers) {
      const trainer = requireDoc<CmsTrainer>(entry, `a trainer of "${team.slug}"`);
      const person =
        trainer.person === null || trainer.person === undefined
          ? null
          : requireDoc<CmsPerson>(trainer.person, `the person of trainer ${trainer.id}`);
      const name = text(person?.name);
      if (name === null) {
        skipped.push(`${team.slug}: trainer ${trainer.id} has no person — skipped`);
        continue;
      }

      const { firstName, lastName } = splitName(name);
      const key = staffKey({ teamEntryId, firstName, lastName });
      if (seen.has(key)) continue;
      seen.add(key);
      matched.push({ teamSlug: team.slug, teamEntryId, trainer, person, name, firstName, lastName });
    }
  }

  // Reported together rather than one at a time: an operator fixing the CMS
  // wants the whole list, not another run to find the next broken team.
  if (unmatched.length > 0) {
    throw new Error(
      `import-staff: ${unmatched.length} CMS team(s) match no team entry:\n  - ${unmatched.join("\n  - ")}`,
    );
  }

  return { matched, skipped };
}

/** Turn CMS teams into the staff rows for the active season's team entries. */
export function planStaffRows(
  teams: CmsTeam[],
  entryIdByPermanentId: Map<number, number>,
): StaffPlan {
  const { matched, skipped } = matchCmsTrainers(teams, entryIdByPermanentId);
  const rows = matched.map(
    ({ teamEntryId, trainer, person, firstName, lastName }): PlannedStaffRow => ({
      teamEntryId,
      firstName,
      lastName,
      role: "trainer",
      phone: text(person?.phone),
      // The trainer's own address wins; the person's is the fallback the
      // website already renders today.
      email: text(trainer.email) ?? text(person?.email),
      licence: text(trainer.licence),
    }),
  );
  return { rows, skipped };
}

/** The trainer's own image first, else the person's — the order the Website renders today. */
function portraitSource(trainer: CmsTrainer, person: CmsPerson | null): CmsMedia | null {
  const own = trainer.image ?? null;
  if (own !== null) return requireDoc<CmsMedia>(own, `the image of trainer ${trainer.id}`);
  const fallback = person?.image ?? null;
  if (fallback !== null) return requireDoc<CmsMedia>(fallback, `the image of person ${person?.id}`);
  return null;
}

/**
 * Plan the portrait copies for staff rows the Hub already holds: one per
 * (entry, name) that the earlier staff pass wrote and that carries no portrait
 * yet. A coach on two team entries gets two copies, because each row owns and
 * deletes its own file. Matching goes through `staffKey`, the same key the
 * staff pass dedupes on, so a rerun after a partial run plans only what is
 * still missing.
 */
export function planPortraits(
  teams: CmsTeam[],
  entryIdByPermanentId: Map<number, number>,
  existing: ExistingStaff[],
): PortraitPlan {
  const rowByKey = new Map(existing.map((row) => [staffKey(row), row]));
  const { matched, skipped } = matchCmsTrainers(teams, entryIdByPermanentId);
  const copies: PlannedPortrait[] = [];
  let alreadyThere = 0;

  for (const { teamSlug, teamEntryId, trainer, person, name, firstName, lastName } of matched) {
    const row = rowByKey.get(staffKey({ teamEntryId, firstName, lastName }));
    if (row === undefined) {
      skipped.push(`${teamSlug}: ${name} has no staff row — run the staff import first`);
      continue;
    }
    if (row.photoFilename !== null) {
      alreadyThere += 1;
      continue;
    }

    const image = portraitSource(trainer, person);
    if (image === null) {
      skipped.push(`${teamSlug}: ${name} has no image — skipped`);
      continue;
    }
    const contentType = image.mimeType ?? "";
    if (!isPortraitContentType(contentType)) {
      skipped.push(
        `${teamSlug}: ${name} has an ${contentType || "untyped"} image, which the hub does not store — skipped`,
      );
      continue;
    }
    const sourceUrl = text(image.url);
    if (sourceUrl === null) {
      skipped.push(`${teamSlug}: ${name} has an image (media ${image.id}) without a url — skipped`);
      continue;
    }

    copies.push({ staffId: row.id, teamEntryId, name, sourceUrl, contentType });
  }

  return { copies, skipped, alreadyThere };
}

/** One planned row as the run log prints it — the operator's record of the run. */
export function describeRow(row: PlannedStaffRow): string {
  return (
    `entry ${row.teamEntryId}: ${row.firstName} ${row.lastName} ` +
    `(${row.licence ?? "no licence"}, ${row.email ?? "no email"}, ${row.phone ?? "no phone"})`
  );
}

/** One planned copy as the run log prints it; the caller appends the resolved source URL. */
export function describePortrait(copy: PlannedPortrait): string {
  return `staff ${copy.staffId} (entry ${copy.teamEntryId}, ${copy.name}, ${copy.contentType})`;
}

/** The planned rows the Hub does not already hold. */
export function newRows(planned: PlannedStaffRow[], existing: Set<string>): PlannedStaffRow[] {
  return planned.filter((row) => !existing.has(staffKey(row)));
}
