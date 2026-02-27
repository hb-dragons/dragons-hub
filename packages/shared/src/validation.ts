import { z } from "zod";
import {
  BOOKING_STATUSES,
  TASK_PRIORITIES,
  DATE_REGEX,
  TIME_REGEX,
} from "./constants";

export const dateSchema = z
  .string()
  .regex(DATE_REGEX, "Must be YYYY-MM-DD");

export const timeSchema = z
  .string()
  .regex(TIME_REGEX, "Must be HH:MM or HH:MM:SS");

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

/**
 * Base match form schema shared between web client validation
 * and API body validation. The API extends this with score fields.
 */
export const matchFormSchema = z.object({
  kickoffDate: dateSchema.nullable().optional(),
  kickoffTime: timeSchema.nullable().optional(),
  isForfeited: z.boolean().nullable().optional(),
  isCancelled: z.boolean().nullable().optional(),
  venueNameOverride: z.string().max(200).nullable().optional(),
  anschreiber: z.string().max(100).nullable().optional(),
  zeitnehmer: z.string().max(100).nullable().optional(),
  shotclock: z.string().max(100).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  publicComment: z.string().max(500).nullable().optional(),
});

export type MatchFormValues = z.infer<typeof matchFormSchema>;
