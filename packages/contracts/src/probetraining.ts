import { z } from "zod";

/**
 * Body of the public Probetraining submission (`POST /public/probetraining`).
 *
 * Field names are preserved 1:1 from the legacy form
 * (`dragons-app/app/components/probetraining/Form.vue`): `month`/`year` are the
 * child's birth month and year — the month in German because that is what the
 * form's dropdown submits — and `mail` (not `email`) is the parent's address.
 *
 * `acceptedPrivacy` is `z.literal(true)`: the privacy checkbox is consent, so
 * an unticked box is a validation error, never a stored `false`.
 *
 * `website` is a honeypot. The form renders it invisible and browsers submit it
 * empty; any content means a bot filled it in. The schema admits only the empty
 * string so a filled honeypot never validates — the route drops such requests
 * silently with a fake 2xx instead of a validation error (don't teach bots).
 */
export const probetrainingRequestSchema = z.object({
  month: z.enum([
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ]),
  year: z.number().int().min(1930).max(new Date().getFullYear()),
  didPlay: z.boolean(),
  gender: z.enum(["männlich", "weiblich", "divers"]),
  mail: z.email(),
  message: z.string().max(2000).optional(),
  acceptedPrivacy: z.literal(true),
  website: z.string().max(0).optional(), // honeypot — any content ⇒ silently dropped
});

export type ProbetrainingRequest = z.infer<typeof probetrainingRequestSchema>;
