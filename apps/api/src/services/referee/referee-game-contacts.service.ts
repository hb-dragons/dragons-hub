import { getDb } from "../../config/database";
import {
  refereeGames,
  matches,
  leagues,
  teams,
  teamEntries,
  teamStaff,
  staffPeople,
} from "@dragons/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  KAMPFGERICHT_ROLES,
  teamDisplayName,
  type KampfgerichtEntry,
  type KampfgerichtRole,
  type RefereeContactGroup,
  type RefereeTeamContact,
} from "@dragons/shared";
import { getActiveSeasonId } from "../admin/season.service";

/**
 * The two blocks the Einsatz screen shows a referee who actually holds the
 * game (#313): which Dragons team runs the Kampfgericht, and whom to call
 * about the Dragons team playing.
 *
 * Both are read here rather than in the visibility service because neither is
 * a column of `referee_games`: the Kampfgericht names live on the linked
 * `matches` row, and the people live on the team entry of whichever season the
 * game belongs to. Keeping them in one reader also keeps the cost where it
 * belongs — the caller only pays for these queries when the caller is allowed
 * to see the answer.
 */
export interface RefereeGameContacts {
  kampfgericht: KampfgerichtEntry[];
  contacts: RefereeContactGroup[];
}

const EMPTY: RefereeGameContacts = { kampfgericht: [], contacts: [] };

interface StaffRow {
  teamEntryId: number;
  firstName: string;
  lastName: string;
  role: RefereeTeamContact["role"];
  phone: string | null;
  email: string | null;
  refereeContact: boolean;
}

interface EntryRow {
  entryId: number;
  teamId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
}

/**
 * The contacts of one team entry: the staff flagged as the referee contact,
 * or — when nobody is flagged — every coach on the entry. A team that named
 * one person for referees gets exactly that person; a team that named nobody
 * is better represented by all of its coaches than by none of them.
 */
function contactsOf(entryId: number, staff: StaffRow[]): RefereeTeamContact[] {
  const own = staff.filter((s) => s.teamEntryId === entryId);
  const flagged = own.filter((s) => s.refereeContact);
  return (flagged.length > 0 ? flagged : own).map((s) => ({
    firstName: s.firstName,
    lastName: s.lastName,
    role: s.role,
    phone: s.phone,
    email: s.email,
  }));
}

/**
 * Group the three Kampfgericht roles by the team named for them, in
 * `KAMPFGERICHT_ROLES` order. One team for all three — the normal case —
 * collapses into a single entry; a split produces one entry per team.
 */
function groupKampfgericht(
  named: Partial<Record<KampfgerichtRole, string | null>>,
): { teamName: string; roles: KampfgerichtRole[] }[] {
  const groups: { teamName: string; roles: KampfgerichtRole[] }[] = [];
  for (const role of KAMPFGERICHT_ROLES) {
    const teamName = named[role];
    if (!teamName) continue;
    const existing = groups.find((g) => g.teamName === teamName);
    if (existing) existing.roles.push(role);
    else groups.push({ teamName, roles: [role] });
  }
  return groups;
}

/**
 * Read the Kampfgericht and team-contact blocks for one referee game.
 *
 * Only ever called for a caller allowed to see them — the gate lives in
 * `getVisibleRefereeGameById`, which knows whether the caller holds a slot.
 */
export async function getRefereeGameContacts(
  refereeGameId: number,
): Promise<RefereeGameContacts> {
  const [game] = await getDb()
    .select({
      matchId: refereeGames.matchId,
      isHomeGame: refereeGames.isHomeGame,
      homeTeamId: refereeGames.homeTeamId,
      guestTeamId: refereeGames.guestTeamId,
      anschreiber: matches.anschreiber,
      zeitnehmer: matches.zeitnehmer,
      shotclock: matches.shotclock,
      // The season the linked match is played in. Null when the referee game
      // has no linked match, or that match sits in an unconnected league.
      seasonId: leagues.seasonRefId,
    })
    .from(refereeGames)
    .leftJoin(matches, eq(refereeGames.matchId, matches.id))
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(eq(refereeGames.id, refereeGameId))
    .limit(1);

  if (!game) return EMPTY;

  // An unlinked referee game is tied to no league, so the active season is the
  // only sensible entry to read the team's people off (#313).
  const seasonId = game.seasonId ?? (await getActiveSeasonId());
  if (seasonId === null) return EMPTY;

  const entries: EntryRow[] = await getDb()
    .select({
      entryId: teamEntries.id,
      teamId: teamEntries.teamId,
      name: teams.name,
      nameShort: teams.nameShort,
      customName: teamEntries.customName,
    })
    .from(teamEntries)
    .innerJoin(teams, eq(teamEntries.teamId, teams.id))
    .where(and(eq(teamEntries.seasonId, seasonId), eq(teams.isOwnClub, true)));

  if (entries.length === 0) return EMPTY;

  const staff: StaffRow[] = await getDb()
    .select({
      teamEntryId: teamStaff.teamEntryId,
      firstName: staffPeople.firstName,
      lastName: staffPeople.lastName,
      role: teamStaff.role,
      phone: staffPeople.phone,
      email: staffPeople.email,
      refereeContact: teamStaff.refereeContact,
    })
    .from(teamStaff)
    .innerJoin(staffPeople, eq(teamStaff.personId, staffPeople.id))
    .where(
      inArray(
        teamStaff.teamEntryId,
        entries.map((e) => e.entryId),
      ),
    );

  // The Dragons teams playing, home before guest. A derby has both; a foreign
  // game — neither side is ours — has none, and shows no contact block at all.
  const playingEntries = [game.homeTeamId, game.guestTeamId]
    .filter((id): id is number => id !== null)
    .map((teamId) => entries.find((e) => e.teamId === teamId))
    .filter((e): e is EntryRow => e !== undefined);

  const contacts: RefereeContactGroup[] = playingEntries
    .map((entry) => ({
      teamEntryId: entry.entryId,
      teamName: teamDisplayName(entry),
      contacts: contactsOf(entry.entryId, staff),
    }))
    // A team with nobody on it contributes no block rather than an empty one.
    .filter((group) => group.contacts.length > 0);

  // Kampfgericht is a home-game duty, and its names are only ever written on a
  // linked match — an away game or an unlinked one has nothing to show.
  const kampfgericht: KampfgerichtEntry[] =
    game.isHomeGame && game.matchId !== null
      ? groupKampfgericht(game).map(({ teamName, roles }) => {
          // The column holds a name, so the match is by name — and a name that
          // fits two entries in one season identifies neither. Naming the team
          // without contacts is honest; guessing one of the two is not.
          const matched = entries.filter((e) => teamDisplayName(e) === teamName);
          const entry = matched.length === 1 ? matched[0]! : undefined;
          const alreadyListed =
            entry !== undefined &&
            contacts.some((group) => group.teamEntryId === entry.entryId);
          return {
            roles,
            teamName,
            contacts:
              entry === undefined || alreadyListed
                ? []
                : contactsOf(entry.entryId, staff),
          };
        })
      : [];

  return { kampfgericht, contacts };
}
