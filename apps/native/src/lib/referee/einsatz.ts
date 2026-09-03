import type {
  KampfgerichtRole,
  RefereeGameDetail,
  RefereeGameListItem,
  RefereeTeamContact,
} from "@dragons/shared";
import type { RouteHref } from "@/lib/nav/href";

/**
 * The referee Einsatz screen's content, decided outside the screen (#307).
 *
 * Every referee game — own-club or foreign, linked to a synced match or not —
 * opens the same screen. Before #307 an own-club game with a linked match went
 * to the fan match screen instead, which shows score, quarters and form but no
 * officials, so the referee could not see who the co-referee was on exactly
 * the games they were most likely to open. The fan screen is still reachable,
 * as a "Spielinfo" link, and only when a match is actually linked.
 *
 * Which sections render, whether that link exists, and where a referee game
 * routes are decided here as plain functions over the list item the API
 * already returns, so they are testable in the node-only setup and the screen
 * only renders the result.
 */

type EinsatzSlotStatus = RefereeGameListItem["sr1Status"];

/**
 * Which maps app the device has — react-native's `Platform.OS`, spelled out so
 * this module stays free of react-native and testable in the node-only setup.
 * Passed in rather than read here so the view stays a pure function.
 */
export type EinsatzPlatform = "ios" | "android" | "windows" | "macos" | "web";

export interface EinsatzSlot {
  slot: 1 | 2;
  /** i18n key for the slot's label, e.g. "Schiedsrichter 1". */
  labelKey: string;
  /** The assigned referee, or null when the slot is unfilled. */
  name: string | null;
  status: EinsatzSlotStatus;
  /** The referee reading the screen holds this slot. */
  isMine: boolean;
  /**
   * The federation still calls this assignment vorläufig (`tempeinteilung`):
   * it is not fest and can still be taken away (#309).
   */
  tentative: boolean;
}

/**
 * The hall's postal address, split the way a German address is written, plus a
 * link that opens it in the device's maps app.
 *
 * `null` when the referee game carries no street: rows synced before #309 have
 * no address at all, and a block with a blank line where the street belongs is
 * worse than no block. The city then stays visible as an ordinary detail row.
 */
interface EinsatzAddress {
  street: string;
  /** "52134 Herzogenrath", or just the city when the postal code is unknown. */
  cityLine: string;
  mapsUrl: string;
}

/** A change the federation made after publishing the fixture (#309). */
type EinsatzChange = "venueChanged" | "timeChanged";

interface EinsatzDetailRow {
  key: "venue" | "address" | "matchNo";
  labelKey: string;
  value: string;
}

type EinsatzBadge = "cancelled" | "forfeited";

/** A tappable way to reach a person — `tel:` starts a call, `mailto:` opens mail. */
interface EinsatzContactAction {
  /** What the screen shows: the number or the address as the team wrote it. */
  label: string;
  /** What `openExternal` is handed. */
  url: string;
}

/** One person on the Einsatz screen, ready to render. */
export interface EinsatzContact {
  /** Stable inside its block — name plus role, since a team has no person ids here. */
  key: string;
  name: string;
  /** i18n key for the staff role, e.g. "teamStaff.role.trainer". */
  roleKey: string;
  phone: EinsatzContactAction | null;
  email: EinsatzContactAction | null;
}

/** The contacts of one Dragons team playing the game. */
interface EinsatzContactGroup {
  key: string;
  teamName: string;
  contacts: EinsatzContact[];
}

/** One Kampfgericht line: the team, the roles it covers, and whom to call. */
interface EinsatzKampfgerichtLine {
  key: string;
  teamName: string;
  /** i18n keys of the roles this team covers, in `KAMPFGERICHT_ROLES` order. */
  roleKeys: string[];
  /** Empty when the team is already in `contacts` — one person, one place. */
  contacts: EinsatzContact[];
}

export interface EinsatzView {
  title: string;
  slots: [EinsatzSlot, EinsatzSlot];
  /** The fan match screen, when the referee game is linked to a synced match. */
  spielinfoRoute: RouteHref | null;
  details: EinsatzDetailRow[];
  badges: EinsatzBadge[];
  /** The full venue address, or null when the row predates #309. */
  address: EinsatzAddress | null;
  /** Venue or kickoff moved by the federation after publication. */
  changes: EinsatzChange[];
  /** The game's page on basketball-bund.net. */
  federationUrl: string;
  /**
   * The Kampfgericht block (#313). Empty — and so hidden — on an away game, on
   * a game with no linked match, and for a caller the API did not send it to
   * (a referee looking at an open game they do not hold).
   */
  kampfgericht: EinsatzKampfgerichtLine[];
  /** The team-contact block (#313). Empty on a foreign game, and hidden then. */
  contacts: EinsatzContactGroup[];
}

/**
 * `tel:` wants digits, not the spaces and slashes a German number is written
 * with; the label keeps the spelling the team entered.
 */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, "")}`;
}

export function mailtoUrl(email: string): string {
  return `mailto:${email}`;
}

function toContact(contact: RefereeTeamContact, index: number): EinsatzContact {
  return {
    key: `${String(index)}:${contact.lastName}:${contact.role}`,
    name: `${contact.firstName} ${contact.lastName}`,
    roleKey: `teamStaff.role.${contact.role}`,
    phone: contact.phone ? { label: contact.phone, url: telUrl(contact.phone) } : null,
    email: contact.email ? { label: contact.email, url: mailtoUrl(contact.email) } : null,
  };
}

function roleKey(role: KampfgerichtRole): string {
  return `refereeGame.kampfgerichtRole.${role}`;
}

/**
 * A maps link for a free-text address.
 *
 * Both schemes hand the query to whichever maps app the platform has, rather
 * than to a browser: `maps://` is Apple Maps, `geo:` is the Android intent every
 * maps app registers for. A device with no handler for either rejects the open,
 * and `openExternal` reports that once, in one place.
 */
export function mapsUrl(query: string, platform: EinsatzPlatform): string {
  const q = encodeURIComponent(query);
  return platform === "ios" ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
}

function einsatzAddress(
  game: RefereeGameDetail,
  platform: EinsatzPlatform,
): EinsatzAddress | null {
  const street = game.brief.venueStreet;
  if (!street) return null;

  const cityLine = [game.brief.venuePostalCode, game.venueCity]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  // The hall's name goes into the query too: federation street data is
  // sometimes thin, and a named sports hall is the part a maps app resolves.
  const query = [game.venueName, street, cityLine]
    .filter((part) => Boolean(part))
    .join(", ");

  return { street, cityLine, mapsUrl: mapsUrl(query, platform) };
}

/** The route every referee game opens at — the Einsatz screen, always. */
export function refereeGameRoute(game: Pick<RefereeGameListItem, "id">): RouteHref {
  return `/referee-game/${String(game.id)}`;
}

/** The fan match screen for a referee game, or null when nothing is linked. */
export function spielinfoRoute(
  game: Pick<RefereeGameListItem, "matchId">,
): RouteHref | null {
  return game.matchId === null ? null : `/game/${String(game.matchId)}`;
}

export function einsatzView(
  game: RefereeGameDetail,
  platform: EinsatzPlatform,
): EinsatzView {
  const address = einsatzAddress(game, platform);

  // Both venue rows are fallbacks for a row with no address block: that block
  // already names the hall and its city, and stating either again three inches
  // below is the same fact twice.
  const details: EinsatzDetailRow[] = [];
  if (address === null && game.venueName) {
    details.push({
      key: "venue",
      labelKey: "gameDetail.venue",
      value: game.venueName,
    });
  }
  if (address === null && game.venueCity) {
    details.push({
      key: "address",
      labelKey: "gameDetail.address",
      value: game.venueCity,
    });
  }
  details.push({
    key: "matchNo",
    labelKey: "refereeGame.matchNo",
    value: String(game.matchNo),
  });

  const badges: EinsatzBadge[] = [];
  if (game.isCancelled) badges.push("cancelled");
  if (game.isForfeited) badges.push("forfeited");

  const changes: EinsatzChange[] = [];
  if (game.brief.venueChanged) changes.push("venueChanged");
  if (game.brief.timeChanged) changes.push("timeChanged");

  return {
    title: `${game.homeTeamName} – ${game.guestTeamName}`,
    slots: [
      {
        slot: 1,
        labelKey: "refereeGame.sr1",
        name: game.sr1Name,
        status: game.sr1Status,
        isMine: game.mySlot === 1,
        tentative: game.brief.sr1Tentative,
      },
      {
        slot: 2,
        labelKey: "refereeGame.sr2",
        name: game.sr2Name,
        status: game.sr2Status,
        isMine: game.mySlot === 2,
        tentative: game.brief.sr2Tentative,
      },
    ],
    spielinfoRoute: spielinfoRoute(game),
    details,
    badges,
    address,
    changes,
    federationUrl: game.brief.federationUrl,
    // Both keys are absent for a caller the API withheld them from, and the
    // screen renders nothing for an empty list either way (#313).
    kampfgericht: (game.kampfgericht ?? []).map((line, index) => ({
      key: `${String(index)}:${line.teamName}`,
      teamName: line.teamName,
      roleKeys: line.roles.map(roleKey),
      contacts: line.contacts.map(toContact),
    })),
    contacts: (game.contacts ?? []).map((group) => ({
      key: String(group.teamEntryId),
      teamName: group.teamName,
      contacts: group.contacts.map(toContact),
    })),
  };
}
