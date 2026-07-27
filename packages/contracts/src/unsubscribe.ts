import { z } from "zod";

/**
 * Query of the public unsubscribe endpoint (GET renders the confirmation, POST
 * performs it). Both methods take the same shape, so the link in the mail and
 * the RFC 8058 one-click POST target the identical URL.
 *
 * The bounds are deliberately loose. A token this schema rejects produces the
 * central JSON 400, which is not something a member who clicked a link in a
 * mail can act on — so anything that could plausibly be a token is let through
 * to the handler, which answers with a readable page. Only a request carrying
 * no token at all, which no mail we send can produce, is rejected here.
 *
 * `locale` never rejects: an unrecognised value falls back to German rather
 * than turning a working unsubscribe link into an error.
 */
export const unsubscribeQuerySchema = z.object({
  token: z.string().min(1).max(200),
  locale: z.enum(["de", "en"]).default("de").catch("de"),
});

export type UnsubscribeQuery = z.infer<typeof unsubscribeQuerySchema>;
