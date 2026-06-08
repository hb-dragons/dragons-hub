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

export const bookingCreateBodySchema = z.object({
  venueId: z.number().int().positive(),
  date: dateSchema,
  overrideStartTime: timeSchema,
  overrideEndTime: timeSchema,
  overrideReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  matchIds: z.array(z.number().int().positive()).optional(),
});

export type BookingCreateBody = z.infer<typeof bookingCreateBodySchema>;
export type BookingUpdateBody = z.infer<typeof bookingUpdateBodySchema>;
export type BookingStatusBody = z.infer<typeof bookingStatusBodySchema>;
