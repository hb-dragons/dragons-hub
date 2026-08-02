/**
 * State, validation and submit logic for the Probetraining form island — the
 * port of dragons-app `app/components/probetraining/Form.vue`'s two-step flow.
 *
 * Validation delegates to the shared contract schema (picked per step), so the
 * client can never drift from what `POST /public/probetraining` accepts; this
 * module only maps the schema's issues onto the German messages the legacy
 * form showed. Kept `.tsx`-free so the whole seam is unit-testable.
 *
 * The contract lives in `packages/contracts`; the site consumes it via a
 * relative import because `apps/site` deliberately declares no dependency on
 * `@dragons/contracts` yet (astro.config already lists it under
 * `ssr.noExternal` for the day it does).
 */
import {
  probetrainingRequestSchema,
  type ProbetrainingRequest,
} from "../../../../packages/contracts/src/probetraining";
import { strings } from "./strings";

/** Month names, straight from the contract enum — single source. */
export const MONTHS = probetrainingRequestSchema.shape.month.options;

/** Gender options, straight from the contract enum — single source. */
export const GENDERS = probetrainingRequestSchema.shape.gender.options;

export type Month = ProbetrainingRequest["month"];
export type Gender = ProbetrainingRequest["gender"];

/** Legacy tab values: the didPlay tabs submit "0" (Nein) / "1" (Ja). */
export type DidPlay = "0" | "1";

/** Legacy `BaseYear`: the newest selectable birth year is 5 years back. */
export const YEAR_OFFSET = 5;

/** Legacy list length cap: at most 100 birth years, newest first. */
export const YEAR_COUNT = 100;

// The oldest year the contract accepts. The legacy list ran 100 years deep
// regardless (into the 1920s), but the endpoint rejects anything below this —
// offering it would only manufacture a doomed submission.
const YEAR_MIN = probetrainingRequestSchema.shape.year.minValue ?? 1930;

export function yearOptions(currentYear = new Date().getFullYear()): number[] {
  const newest = currentYear - YEAR_OFFSET;
  const length = Math.min(YEAR_COUNT, newest - YEAR_MIN + 1);
  return Array.from({ length }, (_, i) => newest - i);
}

export interface ProbetrainingFormState {
  month: Month;
  year: number;
  didPlay: DidPlay;
  gender: Gender | null;
  email: string;
  message: string;
  acceptedPrivacy: boolean;
  /** Honeypot — rendered invisible, submitted verbatim, empty for humans. */
  website: string;
}

/** The legacy defaults: Januar, currentYear-5, "Nein", everything else blank. */
export function initialFormState(
  currentYear = new Date().getFullYear(),
): ProbetrainingFormState {
  return {
    month: "Januar",
    year: currentYear - YEAR_OFFSET,
    didPlay: "0",
    gender: null,
    email: "",
    message: "",
    acceptedPrivacy: false,
    website: "",
  };
}

export interface StepOneErrors {
  gender?: string;
}

export interface StepTwoErrors {
  email?: string;
  message?: string;
  acceptedPrivacy?: string;
}

// Step slices of the contract, mirroring the legacy schemaFirst/schemaSecond
// split. Picking from the request schema keeps the wire contract the single
// source of what each step accepts.
const stepOneSchema = probetrainingRequestSchema.pick({
  month: true,
  year: true,
  didPlay: true,
  gender: true,
});

const stepTwoSchema = probetrainingRequestSchema.pick({
  mail: true,
  message: true,
  acceptedPrivacy: true,
});

/**
 * The form state translated to the contract's wire fields (`email`→`mail`,
 * tab value→boolean, untouched message dropped). Both step validators and
 * the request body parse this one shape; the schemas strip what they don't
 * pick.
 */
function wireFields(state: ProbetrainingFormState) {
  return {
    month: state.month,
    year: state.year,
    didPlay: state.didPlay === "1",
    gender: state.gender ?? undefined,
    mail: state.email,
    ...(state.message === "" ? {} : { message: state.message }),
    acceptedPrivacy: state.acceptedPrivacy,
  };
}

/**
 * Step 1 (month/year/didPlay/gender). Month, year and didPlay come from
 * selects with valid defaults, so — like the legacy schemaFirst — only the
 * initially-empty gender can actually fail.
 */
export function validateStepOne(state: ProbetrainingFormState): StepOneErrors {
  const result = stepOneSchema.safeParse(wireFields(state));
  if (result.success) return {};

  const errors: StepOneErrors = {};
  for (const issue of result.error.issues) {
    if (issue.path[0] === "gender") errors.gender = strings.probetraining.genderRequired;
  }
  return errors;
}

/** Step 2 (email/message/privacy consent), with the legacy German messages. */
export function validateStepTwo(state: ProbetrainingFormState): StepTwoErrors {
  const result = stepTwoSchema.safeParse(wireFields(state));
  if (result.success) return {};

  const errors: StepTwoErrors = {};
  for (const issue of result.error.issues) {
    if (issue.path[0] === "mail") errors.email = strings.probetraining.emailInvalid;
    if (issue.path[0] === "message") errors.message = strings.probetraining.messageTooLong;
    if (issue.path[0] === "acceptedPrivacy") {
      errors.acceptedPrivacy = strings.probetraining.privacyRequired;
    }
  }
  return errors;
}

// Everything but the honeypot must satisfy the contract before the client
// submits. The honeypot is exempt on purpose: the server's guard answers a
// filled `website` with the same fake 201 a real submission gets (before
// validation), and the client must not spoil that by refusing to send it.
const clientSchema = probetrainingRequestSchema.omit({ website: true });

/**
 * The JSON body for `POST /public/probetraining`, or null when the state does
 * not satisfy the contract. Maps the legacy form fields onto the wire names
 * (`email`→`mail`, tab value→boolean) and drops an untouched message.
 */
export function buildRequestBody(state: ProbetrainingFormState): ProbetrainingRequest | null {
  const parsed = clientSchema.safeParse(wireFields(state));
  if (!parsed.success) return null;
  return { ...parsed.data, website: state.website };
}

export type SubmitOutcome = "success" | "rate_limited" | "error";

/**
 * POSTs the submission and folds the response into the three outcomes the
 * island renders: the success step, the friendly 429 message, or the generic
 * error toast (any other failure, network errors included).
 */
export async function submitProbetraining(
  body: ProbetrainingRequest,
  options: { baseUrl: string; fetchImpl?: typeof fetch },
): Promise<SubmitOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${options.baseUrl}/public/probetraining`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 429) return "rate_limited";
    return response.ok ? "success" : "error";
  } catch {
    return "error";
  }
}

/** The "Nein"/"Ja" label the tabs and the summaries show for a didPlay value. */
export function didPlayLabel(didPlay: DidPlay): string {
  return didPlay === "1" ? strings.probetraining.didPlayYes : strings.probetraining.didPlayNo;
}
