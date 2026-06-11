import type {
  SocialMatchItem,
  SocialPlayerPhoto,
  SocialBackground,
  SocialActionResponse,
} from "@dragons/shared";
import type { SocialMatchesQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function socialEndpoints(client: ApiClient) {
  return {
    matches(query: SocialMatchesQuery): Promise<SocialMatchItem[]> {
      return client.get(
        "/admin/social/matches",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    listPlayerPhotos(): Promise<SocialPlayerPhoto[]> {
      return client.get("/admin/social/player-photos");
    },
    deletePlayerPhoto(id: number): Promise<SocialActionResponse> {
      return client.delete(`/admin/social/player-photos/${id}`);
    },
    listBackgrounds(): Promise<SocialBackground[]> {
      return client.get("/admin/social/backgrounds");
    },
    deleteBackground(id: number): Promise<SocialActionResponse> {
      return client.delete(`/admin/social/backgrounds/${id}`);
    },
    setDefaultBackground(id: number): Promise<SocialActionResponse> {
      return client.patch(`/admin/social/backgrounds/${id}/default`);
    },
  };
}
