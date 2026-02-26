import { z } from "zod";

export const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const bookingListQuerySchema = z.object({
  status: z
    .enum(["pending", "requested", "confirmed", "cancelled"])
    .optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

export const bookingUpdateBodySchema = z.object({
  overrideStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS")
    .nullable()
    .optional(),
  overrideEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS")
    .nullable()
    .optional(),
  overrideReason: z.string().max(500).nullable().optional(),
  status: z
    .enum(["pending", "requested", "confirmed", "cancelled"])
    .optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const bookingStatusBodySchema = z.object({
  status: z.enum(["pending", "requested", "confirmed", "cancelled"]),
});

export type BookingUpdateBody = z.infer<typeof bookingUpdateBodySchema>;
export type BookingStatusBody = z.infer<typeof bookingStatusBodySchema>;
