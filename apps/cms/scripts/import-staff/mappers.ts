import type { TeamStaffRole } from "@dragons/shared";

import type { CmsPerson, CmsTeam, CmsTrainer } from "./cms";

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
    throw new Error(`import-staff: ${what} arrived as an id — the CMS read needs depth=2`);
  }
  return value;
}

/**
 * Turn CMS teams into the staff rows for the active season's team entries.
 *
 * Throws rather than skipping whenever a team *has* trainers but cannot be
 * matched: a silently dropped team is a team whose coaches never appear in the
 * app, which is exactly the failure this one-off run cannot leave behind. Every
 * unmatched team is named in one error — a draft team included, since the API
 * key the script uses sees drafts an anonymous reader does not.
 */
export function planStaffRows(
  teams: CmsTeam[],
  entryIdByPermanentId: Map<number, number>,
): StaffPlan {
  const rows: PlannedStaffRow[] = [];
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

      const row: PlannedStaffRow = {
        teamEntryId,
        ...splitName(name),
        role: "trainer",
        phone: text(person?.phone),
        // The trainer's own address wins; the person's is the fallback the
        // website already renders today.
        email: text(trainer.email) ?? text(person?.email),
        licence: text(trainer.licence),
      };
      const key = staffKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  // Reported together rather than one at a time: an operator fixing the CMS
  // wants the whole list, not another run to find the next broken team.
  if (unmatched.length > 0) {
    throw new Error(
      `import-staff: ${unmatched.length} CMS team(s) match no team entry:\n  - ${unmatched.join("\n  - ")}`,
    );
  }

  return { rows, skipped };
}

/** One planned row as the run log prints it — the operator's record of the run. */
export function describeRow(row: PlannedStaffRow): string {
  return (
    `entry ${row.teamEntryId}: ${row.firstName} ${row.lastName} ` +
    `(${row.licence ?? "no licence"}, ${row.email ?? "no email"}, ${row.phone ?? "no phone"})`
  );
}

/** The planned rows the Hub does not already hold. */
export function newRows(planned: PlannedStaffRow[], existing: Set<string>): PlannedStaffRow[] {
  return planned.filter((row) => !existing.has(staffKey(row)));
}
