import { z } from "zod";

export const ingestResponseSchema = z.object({
  ok: z.literal(true),
  changed: z.boolean(),
  snapshotId: z.number().nullable(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
