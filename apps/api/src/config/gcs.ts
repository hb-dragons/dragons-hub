import { Storage } from "@google-cloud/storage";
import { env } from "./env";

let storage: Storage | null = null;

/**
 * Both GCS vars are guarded the same way. `projectId` used to be passed
 * through unchecked: `new Storage({ projectId: undefined })` falls back to
 * whatever project the ambient credentials resolve to, so a missing
 * `GCS_PROJECT_ID` surfaced later as a 403 or a write into the wrong project
 * instead of the same "not configured for social features" error the bucket
 * guard gives.
 */
export function getGcsStorage(): Storage {
  if (!storage) {
    const projectId = env.GCS_PROJECT_ID;
    if (!projectId) {
      throw new Error("GCS_PROJECT_ID is required for social features");
    }
    storage = new Storage({ projectId });
  }
  return storage;
}

export function getGcsBucket() {
  const bucketName = env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is required for social features");
  }
  return getGcsStorage().bucket(bucketName);
}
