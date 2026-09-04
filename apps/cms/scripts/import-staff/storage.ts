/**
 * The Hub's asset bucket, as the `--portraits` pass writes to it.
 *
 * The size bound, the object prefix and the content-type → extension map are
 * duplicated on purpose from the API's portrait service,
 * `apps/api/src/services/admin/team-staff-photo.service.ts`
 * (`UPLOAD_PREFIX`, `MAX_PORTRAIT_DIMENSION`, `EXT_BY_CONTENT_TYPE`): this is
 * a one-off script in another package, and the CMS app must not grow an import
 * of the API's service layer — with its env schema and database client — to
 * run it. Every object written here has to be readable by that service
 * afterwards, so if its rules change, change these by hand to match.
 *
 * Credentials are Application Default Credentials: `gcloud auth
 * application-default login` locally, the service account on a Cloud Run job.
 */
import { randomUUID } from "node:crypto";
import { Storage, type Bucket } from "@google-cloud/storage";
import sharp from "sharp";

import { PORTRAIT_EXT_BY_CONTENT_TYPE } from "./mappers";

const PORTRAIT_PREFIX = "team-staff-photos";
export const MAX_PORTRAIT_DIMENSION = 512;

function env(name: "GCS_BUCKET_NAME"): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

/** The Hub's asset bucket — the API's `GCS_BUCKET_NAME`, not the CMS media bucket. */
export function openBucket(): Bucket {
  return new Storage().bucket(env("GCS_BUCKET_NAME"));
}

/**
 * Normalise and upload one portrait, returning the object name to record on
 * the staff row — the same shape `storeStaffPortrait` produces for an admin
 * upload, so the public portrait route serves both alike.
 */
export async function storePortrait(bucket: Bucket, buffer: Buffer, contentType: string): Promise<string> {
  const ext = PORTRAIT_EXT_BY_CONTENT_TYPE[contentType];
  if (ext === undefined) throw new Error(`import-staff: cannot store a ${contentType} portrait`);

  // `fit: inside` keeps the aspect ratio, `withoutEnlargement` leaves a small
  // image alone, and no output format is named, so jpeg stays jpeg and webp
  // stays webp — exactly what the Hub's upload path does.
  const normalised = await sharp(buffer)
    .resize(MAX_PORTRAIT_DIMENSION, MAX_PORTRAIT_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const filename = `${randomUUID()}${ext}`;
  await bucket
    .file(`${PORTRAIT_PREFIX}/${filename}`)
    .save(normalised, { metadata: { contentType }, resumable: false });
  return filename;
}
