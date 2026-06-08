import { z } from "zod";

export const deviceRegisterBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  locale: z.string().min(2).max(15).optional(),
});

export type DeviceRegisterBody = z.infer<typeof deviceRegisterBodySchema>;
