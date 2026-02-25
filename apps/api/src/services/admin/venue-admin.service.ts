import { ilike } from "drizzle-orm";
import { db } from "../../config/database";
import { venues } from "@dragons/db/schema";

export interface VenueSearchResult {
  id: number;
  name: string;
  street: string | null;
  city: string | null;
}

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
