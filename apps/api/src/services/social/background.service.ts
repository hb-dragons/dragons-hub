import { randomUUID } from "node:crypto";
import { db } from "../../config/database";
import { socialBackgrounds } from "@dragons/db/schema";
import { eq, desc } from "drizzle-orm";
import sharp from "sharp";
import { uploadToGcs, downloadFromGcs, deleteFromGcs } from "./gcs-storage.service";

const UPLOAD_PREFIX = "backgrounds";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const TARGET_SIZE = 1080;

export async function listBackgrounds() {
  return db.select().from(socialBackgrounds).orderBy(desc(socialBackgrounds.createdAt));
}

export async function getBackgroundById(id: number) {
  const [record] = await db.select().from(socialBackgrounds).where(eq(socialBackgrounds.id, id));
  return record ?? null;
}

export async function uploadBackground(buffer: Buffer, originalName: string, contentType: string) {
  if (!ALLOWED_TYPES.includes(contentType))
    throw new Error(`Invalid file type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  if (buffer.length > MAX_FILE_SIZE)
    throw new Error(`File too large: ${buffer.length} bytes. Max: ${MAX_FILE_SIZE}`);

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Could not read image dimensions");
  if (metadata.width < TARGET_SIZE || metadata.height < TARGET_SIZE)
    throw new Error(
      `Image must be at least ${TARGET_SIZE}x${TARGET_SIZE}px. Got ${metadata.width}x${metadata.height}`,
    );

  const resized = await sharp(buffer).resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover" }).png().toBuffer();

  const filename = `${randomUUID()}.png`;
  await uploadToGcs(`${UPLOAD_PREFIX}/${filename}`, resized, "image/png");

  const [record] = await db
    .insert(socialBackgrounds)
    .values({ filename, originalName, width: TARGET_SIZE, height: TARGET_SIZE })
    .returning();
  return record;
}

export async function deleteBackground(id: number) {
  const [record] = await db.delete(socialBackgrounds).where(eq(socialBackgrounds.id, id)).returning();
  if (record) await deleteFromGcs(`${UPLOAD_PREFIX}/${record.filename}`);
  return record ?? null;
}

export async function setDefaultBackground(id: number) {
  await db.transaction(async (tx) => {
    await tx.update(socialBackgrounds).set({ isDefault: false }).where(eq(socialBackgrounds.isDefault, true));
    await tx.update(socialBackgrounds).set({ isDefault: true }).where(eq(socialBackgrounds.id, id));
  });
}

export async function getBackgroundImage(filename: string): Promise<Buffer> {
  return downloadFromGcs(`${UPLOAD_PREFIX}/${filename}`);
}
