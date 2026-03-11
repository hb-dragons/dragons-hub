import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { db } from "../../config/database";
import { playerPhotos } from "@dragons/db/schema";
import { eq, desc } from "drizzle-orm";
import sharp from "sharp";
import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

const UPLOAD_PREFIX = "player-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function listPlayerPhotos() {
  return db.select().from(playerPhotos).orderBy(desc(playerPhotos.createdAt));
}

export async function getPlayerPhotoById(id: number) {
  const [record] = await db.select().from(playerPhotos).where(eq(playerPhotos.id, id));
  return record ?? null;
}

export async function uploadPlayerPhoto(buffer: Buffer, originalName: string, contentType: string) {
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error(`Invalid file type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  if (buffer.length > MAX_FILE_SIZE) throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE}`);

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Could not read image dimensions");

  const ext = extname(originalName) || ".png";
  const filename = `${randomUUID()}${ext}`;
  await uploadToGcs(`${UPLOAD_PREFIX}/${filename}`, buffer, contentType);

  const [record] = await db.insert(playerPhotos).values({ filename, originalName, width: metadata.width, height: metadata.height }).returning();
  return record;
}

export async function deletePlayerPhoto(id: number) {
  const [record] = await db.delete(playerPhotos).where(eq(playerPhotos.id, id)).returning();
  if (record) await deleteFromGcs(`${UPLOAD_PREFIX}/${record.filename}`);
  return record ?? null;
}

export async function getPlayerPhotoImage(filename: string): Promise<Buffer> {
  return downloadFromGcs(`${UPLOAD_PREFIX}/${filename}`);
}
