import { z } from "zod";
import { dateSchema, timeSchema, bookingStatusSchema } from "@dragons/shared";

export const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const bookingListQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const bookingUpdateBodySchema = z.object({
  overrideStartTime: timeSchema.nullable().optional(),
  overrideEndTime: timeSchema.nullable().optional(),
  overrideReason: z.string().max(500).nullable().optional(),
  status: bookingStatusSchema.optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const bookingStatusBodySchema = z.object({
  status: bookingStatusSchema,
});

export type BookingUpdateBody = z.infer<typeof bookingUpdateBodySchema>;
export type BookingStatusBody = z.infer<typeof bookingStatusBodySchema>;
