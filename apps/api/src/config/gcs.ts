import { Storage } from "@google-cloud/storage";
import { env } from "./env";

let storage: Storage | null = null;

export function getGcsStorage(): Storage {
  if (!storage) {
    storage = new Storage({ projectId: env.GCS_PROJECT_ID });
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
