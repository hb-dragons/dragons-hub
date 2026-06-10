/**
 * Social post generator response shapes.
 *
 * Mirrors the JSON returned by the `/admin/social` routes:
 * - `SocialMatchItem` from `getWeekendMatches` (GET /admin/social/matches)
 * - `SocialPlayerPhoto` from `listPlayerPhotos` (GET /admin/social/player-photos)
 * - `SocialBackground` from `listBackgrounds` (GET /admin/social/backgrounds)
 *
 * Timestamp columns serialize to ISO strings over the wire.
 */

/** One weekend match returned for social post generation. */
export interface SocialMatchItem {
  id: number;
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffDate: string;
  kickoffTime: string;
  homeScore: number | null;
  guestScore: number | null;
}

/** A stored player photo (player_photos row serialized to JSON). */
export interface SocialPlayerPhoto {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

/** A stored background image (social_backgrounds row serialized to JSON). */
export interface SocialBackground {
  id: number;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response of the mutating social routes that return only a success flag:
 * DELETE /admin/social/player-photos/:id, DELETE /admin/social/backgrounds/:id,
 * and PATCH /admin/social/backgrounds/:id/default.
 */
export interface SocialActionResponse {
  success: boolean;
}
