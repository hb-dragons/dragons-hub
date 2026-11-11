/**
 * Derived values for the game detail screen: the venue block and the
 * head-to-head averages.
 */
import type { HeadToHead } from "@dragons/shared";

export interface VenueFields {
  venueName: string | null;
  venueNameOverride: string | null;
  venueStreet: string | null;
  venuePostalCode: string | null;
  venueCity: string | null;
}

export interface VenueBlock {
  /** The hall's name; the admin override wins over the federation's. */
  name: string | null;
  /** `"Musterweg 4, 30519 Hannover"`, or null when no part is known. */
  address: string | null;
  /** What to hand the maps app, or null when there is nothing to search for. */
  mapsQuery: string | null;
}

/** The "Halle" group, or null when the game has neither a hall name nor an address. */
export function venueBlock(match: VenueFields): VenueBlock | null {
  const name = match.venueNameOverride || match.venueName || null;
  const cityLine = [match.venuePostalCode, match.venueCity].filter(Boolean).join(" ");
  const parts = [match.venueStreet, cityLine].filter(Boolean);
  const address = parts.length > 0 ? parts.join(", ") : null;
  if (!name && !address) return null;
  // A street is what makes the search land on the door. Without one the hall
  // name narrows the city down; a bare name finds nothing reliable.
  const mapsQuery = match.venueStreet ? address : name && address ? `${name}, ${address}` : null;
  return { name, address, mapsQuery };
}

export interface HeadToHeadAverages {
  /** Points per game, rounded to whole points; null before the first meeting. */
  avgFor: number | null;
  avgAgainst: number | null;
}

/**
 * Points per game against this opponent. The record carries season totals,
 * which grow with every meeting and say little on their own; the average is
 * the number a reader compares with a single game's score.
 */
export function headToHeadAverages(
  data: Pick<HeadToHead, "wins" | "losses" | "pointsFor" | "pointsAgainst">,
): HeadToHeadAverages {
  const games = data.wins + data.losses;
  if (games <= 0) return { avgFor: null, avgAgainst: null };
  return {
    avgFor: Math.round(data.pointsFor / games),
    avgAgainst: Math.round(data.pointsAgainst / games),
  };
}
