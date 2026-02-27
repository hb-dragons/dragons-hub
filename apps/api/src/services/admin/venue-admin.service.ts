import { asc, ilike } from "drizzle-orm";
import { db } from "../../config/database";
import { venues } from "@dragons/db/schema";
import type { VenueSearchResult, VenueListItem } from "@dragons/shared";

export async function searchVenues(
  query: string,
  limit: number = 10,
): Promise<VenueSearchResult[]> {
  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      street: venues.street,
      city: venues.city,
    })
    .from(venues)
    .where(ilike(venues.name, `%${query}%`))
    .limit(limit);

  return rows;
}

export async function getVenues(): Promise<VenueListItem[]> {
  const rows = await db
    .select({
      id: venues.id,
      apiId: venues.apiId,
      name: venues.name,
      street: venues.street,
      postalCode: venues.postalCode,
      city: venues.city,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(venues)
    .orderBy(asc(venues.name));

  return rows;
}
