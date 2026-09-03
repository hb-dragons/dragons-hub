import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  uploadToGcs,
  downloadFromGcs,
  deleteFromGcs,
} from "../social/gcs-storage.service";

/**
 * Portrait bytes for a team staff member. Storage only — the column that points
 * at the object, and the ownership checks around it, live in
 * `team-staff.service.ts`, which is what keeps the two modules free of a cycle.
 *
 * The validate-then-normalize shape is the one `social/player-photo.service.ts`
 * already uses for player photos; portraits differ only in the prefix and in a
 * tighter dimension bound, since they render as an avatar rather than as the
 * subject of a 1080² composite.
 */

const UPLOAD_PREFIX = "team-staff-photos";

export const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;
export const MAX_PORTRAIT_DIMENSION = 512;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const ALLOWED_PORTRAIT_TYPES = Object.keys(EXT_BY_CONTENT_TYPE);

export type PortraitRejectionReason = "unsupported_type" | "too_large" | "unreadable";

/**
 * A portrait the store refuses. Carries a `reason` so the route can answer with
 * the central 400 envelope instead of matching on a message string.
 */
export class PortraitRejected extends Error {
  constructor(
    readonly reason: PortraitRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "PortraitRejected";
  }
}

function objectPath(filename: string): string {
  return `${UPLOAD_PREFIX}/${filename}`;
}

/**
 * Validates, downscales and uploads a portrait, returning the object name to
 * record on the staff row. Throws `PortraitRejected` for anything the caller
 * sent that is not a storable image.
 */
export async function storeStaffPortrait(buffer: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_CONTENT_TYPE[contentType];
  if (ext === undefined) {
    throw new PortraitRejected(
      "unsupported_type",
      `Invalid file type: ${contentType}. Allowed: ${ALLOWED_PORTRAIT_TYPES.join(", ")}`,
    );
  }
  if (buffer.length > MAX_PORTRAIT_BYTES) {
    throw new PortraitRejected(
      "too_large",
      `File too large: ${buffer.length} bytes. Max: ${MAX_PORTRAIT_BYTES}`,
    );
  }

  // sharp throws on bytes that only claim to be an image, so a declared
  // content type that does not match the payload is rejected here rather than
  // stored and served back as an image later.
  let normalized: Buffer;
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new PortraitRejected("unreadable", "Could not read image dimensions");
    }
    // `fit: inside` keeps the aspect ratio and `withoutEnlargement` leaves an
    // already-small portrait alone, so a phone photo shrinks and a 96px avatar
    // is stored as it arrived.
    normalized = await sharp(buffer)
      .resize(MAX_PORTRAIT_DIMENSION, MAX_PORTRAIT_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch (error) {
    if (error instanceof PortraitRejected) throw error;
    throw new PortraitRejected("unreadable", "Could not read the uploaded image");
  }

  const filename = `${randomUUID()}${ext}`;
  await uploadToGcs(objectPath(filename), normalized, contentType);
  return filename;
}

export async function readStaffPortrait(filename: string): Promise<Buffer> {
  return downloadFromGcs(objectPath(filename));
}

export async function deleteStaffPortrait(filename: string): Promise<void> {
  await deleteFromGcs(objectPath(filename));
}

/** The type to serve stored bytes as. Object names come from `storeStaffPortrait`. */
export function staffPortraitContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXT[ext] ?? "image/png";
}
