// How the GCS storage plugin exposes media, driven by GCS_MEDIA_PUBLIC so it
// always matches the bucket's actual IAM (tofu var `cms_media_public`).
//
// Public bucket: `disablePayloadAccessControl` makes `doc.url` the absolute
// https://storage.googleapis.com/<bucket>/… URL, so the static site links
// straight at GCS instead of proxying every image through this scale-to-zero
// service. Private bucket (the default — the org's domain-restricted-sharing
// constraint rejects the allUsers grant): URLs stay relative and Payload
// serves the bytes. Claiming direct-GCS URLs for a private bucket would 403
// every image, which is why this tracks one env var rather than a hardcoded
// choice.

type MediaCollectionOptions = true | { disablePayloadAccessControl: true };

export function mediaStorageOptions(raw: string | undefined): MediaCollectionOptions {
  // The plugin types the flag `true | undefined`, so the private case omits it
  // rather than passing false.
  return raw === "true" ? { disablePayloadAccessControl: true } : true;
}
