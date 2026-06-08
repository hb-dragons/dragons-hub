import { z } from "zod";

export const settingsClubConfigSchema = z.object({
  clubId: z.number().int().positive(),
  clubName: z.string().min(1),
});

export const settingsBookingConfigSchema = z.object({
  bufferBefore: z.number().int().min(0),
  bufferAfter: z.number().int().min(0),
  gameDuration: z.number().int().positive(),
  dueDaysBefore: z.number().int().min(0),
});

export const settingsRefereeReminderSchema = z.object({
  days: z.array(z.number().int().positive()).min(1).max(10),
});

export type SettingsClubConfig = z.infer<typeof settingsClubConfigSchema>;
export type SettingsBookingConfig = z.infer<typeof settingsBookingConfigSchema>;
export type SettingsRefereeReminder = z.infer<typeof settingsRefereeReminderSchema>;
