import { createHash } from "node:crypto";

export function computeEntityHash(data: Record<string, unknown>): string {
  const sortedKeys = Object.keys(data).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sorted[key] = data[key];
  }
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
