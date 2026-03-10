import ical, {
  ICalCalendarMethod,
  ICalEventStatus,
} from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import type { MatchListItem } from "@dragons/shared";

const TIMEZONE = "Europe/Berlin";
const GAME_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const PROD_ID = "-//Dragons//Spielplan//DE";

export interface CalendarFeedOptions {
  calendarName?: string;
  hostname?: string;
}

function resolveTeamName(team: {
  customName: string | null;
  nameShort: string | null;
  name: string;
}): string {
  return team.customName ?? team.nameShort ?? team.name;
}

function buildDescription(
  match: MatchListItem,
  homeName: string,
  guestName: string,
): string {
  const parts: string[] = [];

  // Full team names (summary only has short names)
  parts.push(`${match.homeTeamName} vs ${match.guestTeamName}`);
  if (match.kickoffTime) parts.push(`Anpfiff: ${match.kickoffTime} Uhr`);

  if (match.leagueName) parts.push(match.leagueName);
  if (match.homeScore !== null && match.guestScore !== null) {
    parts.push(`Ergebnis: ${match.homeScore}:${match.guestScore}`);
  }
  if (match.publicComment) parts.push(match.publicComment);
  return parts.join("\n");
}

interface LocationData {
  title: string;
  address?: string;
}

function buildLocation(match: MatchListItem): LocationData | undefined {
  const venueName = match.venueNameOverride ?? match.venueName;
  if (!venueName) return undefined;

  const addressParts: string[] = [];
  if (match.venueStreet) addressParts.push(match.venueStreet);
  if (match.venuePostalCode && match.venueCity) {
    addressParts.push(`${match.venuePostalCode} ${match.venueCity}`);
  } else if (match.venueCity) {
    addressParts.push(match.venueCity);
  }

  const location: LocationData = { title: venueName };
  if (addressParts.length > 0) {
    location.address = addressParts.join(", ");
  }
  return location;
}

function getStatus(match: MatchListItem): ICalEventStatus {
  if (match.isCancelled) return ICalEventStatus.CANCELLED;
  return ICalEventStatus.CONFIRMED;
}

export function buildCalendarFeed(
  matches: MatchListItem[],
  options: CalendarFeedOptions,
): string {
  const hostname = options.hostname ?? "dragons.local";
  const calendarName = options.calendarName ?? "Dragons Spielplan";

  const calendar = ical({
    name: calendarName,
    prodId: PROD_ID,
    timezone: {
      name: TIMEZONE,
      generator: getVtimezoneComponent,
    },
  });
  calendar.method(ICalCalendarMethod.PUBLISH);

  for (const match of matches) {
    const homeName = resolveTeamName({
      customName: match.homeTeamCustomName,
      nameShort: match.homeTeamNameShort,
      name: match.homeTeamName,
    });
    const guestName = resolveTeamName({
      customName: match.guestTeamCustomName,
      nameShort: match.guestTeamNameShort,
      name: match.guestTeamName,
    });

    // Parse kickoff into a Date in Europe/Berlin
    const dateParts = match.kickoffDate.split("-").map(Number);
    const timeParts = match.kickoffTime.split(":").map(Number);
    const start = new Date(
      dateParts[0]!,
      dateParts[1]! - 1,
      dateParts[2],
      timeParts[0],
      timeParts[1],
    );
    const end = new Date(start.getTime() + GAME_DURATION_MS);

    const event = calendar.createEvent({
      id: `match-${match.id}@${hostname}`,
      start,
      end,
      timezone: TIMEZONE,
      summary: `${homeName} vs ${guestName}`,
      description: buildDescription(match, homeName, guestName),
      status: getStatus(match),
    });

    const loc = buildLocation(match);
    if (loc) {
      event.location(loc);
    }
  }

  return calendar.toString();
}
