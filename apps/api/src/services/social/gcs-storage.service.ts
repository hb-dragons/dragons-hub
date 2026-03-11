import { getGcsBucket } from "../../config/gcs";

export async function uploadToGcs(path: string, buffer: Buffer, contentType: string): Promise<void> {
  const file = getGcsBucket().file(path);
  await file.save(buffer, { metadata: { contentType }, resumable: false });
}

export async function downloadFromGcs(path: string): Promise<Buffer> {
  const [buffer] = await getGcsBucket().file(path).download();
  return buffer;
}

export async function deleteFromGcs(path: string): Promise<void> {
  await getGcsBucket().file(path).delete({ ignoreNotFound: true });
}
