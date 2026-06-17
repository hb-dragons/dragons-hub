import { randomUUID } from "node:crypto";
import { getDb } from "../../config/database";
import { playerPhotos } from "@dragons/db/schema";
import { eq, desc } from "drizzle-orm";
import sharp from "sharp";
import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

const UPLOAD_PREFIX = "player-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Player photos are composited onto a 1080² canvas, so storing anything larger
// is wasted bytes and lets a later scale-up force a huge sharp surface. Bound
// the longest edge on upload; never enlarge smaller images.
const MAX_STORED_DIMENSION = 1080;
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const ALLOWED_TYPES = Object.keys(EXT_BY_CONTENT_TYPE);

export async function listPlayerPhotos() {
  return getDb().select().from(playerPhotos).orderBy(desc(playerPhotos.createdAt));
}

export async function getPlayerPhotoById(id: number) {
  const [record] = await getDb().select().from(playerPhotos).where(eq(playerPhotos.id, id));
  return record ?? null;
}

export async function uploadPlayerPhoto(buffer: Buffer, originalName: string, contentType: string) {
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error(`Invalid file type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  if (buffer.length > MAX_FILE_SIZE) throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE}`);

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Could not read image dimensions");

  // Normalize to a bounded dimension so a large photo scaled up at composite
  // time can't blow up memory. `fit: inside` preserves aspect ratio and
  // `withoutEnlargement` leaves already-small images untouched.
  const { data: normalized, info } = await sharp(buffer)
    .resize(MAX_STORED_DIMENSION, MAX_STORED_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? ".png";
  const filename = `${randomUUID()}${ext}`;
  await uploadToGcs(`${UPLOAD_PREFIX}/${filename}`, normalized, contentType);

  const [record] = await getDb().insert(playerPhotos).values({ filename, originalName, width: info.width, height: info.height }).returning();
  return record;
}

export async function deletePlayerPhoto(id: number) {
  const [record] = await getDb().delete(playerPhotos).where(eq(playerPhotos.id, id)).returning();
  if (record) await deleteFromGcs(`${UPLOAD_PREFIX}/${record.filename}`);
  return record ?? null;
}

export async function getPlayerPhotoImage(filename: string): Promise<Buffer> {
  return downloadFromGcs(`${UPLOAD_PREFIX}/${filename}`);
}
