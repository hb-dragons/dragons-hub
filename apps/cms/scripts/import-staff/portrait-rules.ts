/**
 * What the Hub accepts as a staff portrait, and where it keeps one.
 *
 * Duplicated on purpose from the API's portrait service,
 * `apps/api/src/services/admin/team-staff-photo.service.ts` (`UPLOAD_PREFIX`,
 * `MAX_PORTRAIT_BYTES`, `MAX_PORTRAIT_DIMENSION`, `EXT_BY_CONTENT_TYPE`): the
 * import is a one-off script in another package, and the CMS app must not
 * grow an import of the API's service layer — with its env schema and
 * database client — to run it. Every object the import writes has to be
 * readable by that service afterwards, so if its rules change, change these
 * by hand to match; `portrait-rules.test.ts` pins the values so the drift at
 * least shows up as a failing test rather than a silently different object.
 */

export const PORTRAIT_PREFIX = "team-staff-photos";
export const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;
export const MAX_PORTRAIT_DIMENSION = 512;

export const PORTRAIT_EXT_BY_CONTENT_TYPE = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
} as const;

export type PortraitContentType = keyof typeof PORTRAIT_EXT_BY_CONTENT_TYPE;

export function isPortraitContentType(value: string): value is PortraitContentType {
  return Object.hasOwn(PORTRAIT_EXT_BY_CONTENT_TYPE, value);
}
