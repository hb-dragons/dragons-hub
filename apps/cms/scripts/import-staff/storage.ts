/**
 * The Hub's asset bucket, as the `--portraits` pass writes to it. What a
 * portrait may be — type, size, prefix — is `portrait-rules.ts`, mirrored by
 * hand from the API's portrait service; this module only applies it.
 *
 * Credentials are Application Default Credentials: `gcloud auth
 * application-default login` locally, the service account on a Cloud Run job.
 */
import { randomUUID } from "node:crypto";
import { Storage, type Bucket } from "@google-cloud/storage";
import sharp from "sharp";

import { requireEnv } from "./env";
import {
  MAX_PORTRAIT_BYTES,
  MAX_PORTRAIT_DIMENSION,
  PORTRAIT_EXT_BY_CONTENT_TYPE,
  PORTRAIT_PREFIX,
  type PortraitContentType,
} from "./portrait-rules";

/** The Hub's asset bucket — the API's `GCS_BUCKET_NAME`, not the CMS media bucket. */
export function openBucket(): Bucket {
  return new Storage().bucket(requireEnv("GCS_BUCKET_NAME"));
}

/**
 * Normalise and upload one portrait, returning the object name to record on
 * the staff row — the same checks and the same shape `storeStaffPortrait`
 * applies to an admin upload, so the public portrait route serves both alike.
 */
export async function storePortrait(
  bucket: Bucket,
  buffer: Buffer,
  contentType: PortraitContentType,
): Promise<string> {
  if (buffer.length > MAX_PORTRAIT_BYTES) {
    throw new Error(
      `import-staff: portrait is ${buffer.length} bytes, over the hub's ${MAX_PORTRAIT_BYTES} byte bound`,
    );
  }

  // `fit: inside` keeps the aspect ratio, `withoutEnlargement` leaves a small
  // image alone, and no output format is named, so jpeg stays jpeg and webp
  // stays webp — exactly what the Hub's upload path does. Bytes that are not
  // an image make sharp throw here, which stops the run the same way.
  const normalised = await sharp(buffer)
    .resize(MAX_PORTRAIT_DIMENSION, MAX_PORTRAIT_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const filename = `${randomUUID()}${PORTRAIT_EXT_BY_CONTENT_TYPE[contentType]}`;
  await bucket
    .file(`${PORTRAIT_PREFIX}/${filename}`)
    .save(normalised, { metadata: { contentType }, resumable: false });
  return filename;
}
