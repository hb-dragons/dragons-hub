import type { HallOccupancyDay } from "@dragons/shared";
import type { HallOccupancyQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function hallOccupancyEndpoints(client: ApiClient) {
  return {
    list(query?: HallOccupancyQuery): Promise<HallOccupancyDay[]> {
      return client.get(
        "/admin/hall-occupancy",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
  };
}
