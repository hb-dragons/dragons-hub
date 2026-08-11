import { z } from "zod";

export const deviceRegisterBodySchema = z.strictObject({
  // Capped to match deviceTokenParamSchema below. A token longer than 512
  // chars could be registered but never unregistered (DELETE /:token would
  // 400 forever on its own length check) — the asymmetry never mattered while
  // Expo tokens stayed ~41 chars, but the bound belongs on both ends.
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android"]),
  locale: z.string().min(2).max(15).optional(),
});

export type DeviceRegisterBody = z.infer<typeof deviceRegisterBodySchema>;

/**
 * The `:token` path parameter on `DELETE /devices/:token`.
 *
 * Push tokens (Expo's `ExponentPushToken[xxx]`) are longer and shaped
 * differently than the other id-like path params in this codebase, so this
 * does not build on the shared `idParamSchema` — it is a permissive string
 * bound, wide enough to admit any token this service would ever have issued.
 */
export const deviceTokenParamSchema = z.object({
  token: z.string().min(1).max(512),
});

export type DeviceTokenParam = z.infer<typeof deviceTokenParamSchema>;
