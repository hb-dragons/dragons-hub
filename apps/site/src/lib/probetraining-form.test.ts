import { describe, expect, it, vi } from "vitest";

import { probetrainingRequestSchema } from "../../../../packages/contracts/src/probetraining";
import {
  buildRequestBody,
  didPlayLabel,
  GENDERS,
  initialFormState,
  MONTHS,
  submitProbetraining,
  validateStepOne,
  validateStepTwo,
  YEAR_COUNT,
  YEAR_OFFSET,
  yearOptions,
  type ProbetrainingFormState,
} from "./probetraining-form";
import { strings } from "./strings";

/** A state that passes both steps — the baseline the failure cases mutate. */
function validState(): ProbetrainingFormState {
  return {
    ...initialFormState(2026),
    gender: "weiblich",
    email: "eltern@example.com",
    message: "Wir freuen uns!",
    acceptedPrivacy: true,
  };
}

describe("option lists", () => {
  it("derives the month options from the contract enum (single source)", () => {
    expect(MONTHS).toEqual(probetrainingRequestSchema.shape.month.options);
    expect(MONTHS[0]).toBe("Januar");
    expect(MONTHS).toHaveLength(12);
  });

  it("derives the gender options from the contract enum (single source)", () => {
    expect(GENDERS).toEqual(probetrainingRequestSchema.shape.gender.options);
    expect(GENDERS).toEqual(["männlich", "weiblich", "divers"]);
  });

  it("offers 100 birth years, newest first, starting 5 years back (legacy BaseYear)", () => {
    const years = yearOptions(2026);
    expect(years).toHaveLength(YEAR_COUNT);
    expect(years[0]).toBe(2026 - YEAR_OFFSET);
    expect(years[1]).toBe(2026 - YEAR_OFFSET - 1);
    expect(years[years.length - 1]).toBe(2026 - YEAR_OFFSET - (YEAR_COUNT - 1));
  });

  it("defaults the year options to the current year", () => {
    expect(yearOptions()[0]).toBe(new Date().getFullYear() - YEAR_OFFSET);
  });
});

describe("initialFormState", () => {
  it("mirrors the legacy defaults: Januar, currentYear-5, didPlay no, nothing else", () => {
    expect(initialFormState(2026)).toEqual({
      month: "Januar",
      year: 2021,
      didPlay: "0",
      gender: null,
      email: "",
      message: "",
      acceptedPrivacy: false,
      website: "",
    });
  });

  it("defaults to the current year when none is given", () => {
    expect(initialFormState().year).toBe(new Date().getFullYear() - YEAR_OFFSET);
  });
});

describe("validateStepOne", () => {
  it("passes with the defaults once a gender is chosen", () => {
    expect(validateStepOne(validState())).toEqual({});
  });

  it("requires a gender, with the legacy message", () => {
    const errors = validateStepOne({ ...validState(), gender: null });
    expect(errors.gender).toBe(strings.probetraining.genderRequired);
  });

  it("accepts every gender the contract admits", () => {
    for (const gender of GENDERS) {
      expect(validateStepOne({ ...validState(), gender })).toEqual({});
    }
  });

  it("flags nothing but gender even if another field is corrupted", () => {
    const state = { ...validState(), month: "Nixember" as ProbetrainingFormState["month"] };
    expect(validateStepOne(state).gender).toBeUndefined();
  });
});

describe("validateStepTwo", () => {
  it("passes for a valid email with consent", () => {
    expect(validateStepTwo(validState())).toEqual({});
  });

  it("rejects an invalid email with the legacy message", () => {
    const errors = validateStepTwo({ ...validState(), email: "keine-mail" });
    expect(errors.email).toBe(strings.probetraining.emailInvalid);
  });

  it("rejects an empty email", () => {
    expect(validateStepTwo({ ...validState(), email: "" }).email).toBe(
      strings.probetraining.emailInvalid,
    );
  });

  it("requires the privacy consent, with the legacy message", () => {
    const errors = validateStepTwo({ ...validState(), acceptedPrivacy: false });
    expect(errors.acceptedPrivacy).toBe(strings.probetraining.privacyRequired);
  });

  it("caps the message at the contract's 2000 characters", () => {
    const errors = validateStepTwo({ ...validState(), message: "x".repeat(2001) });
    expect(errors.message).toBe(strings.probetraining.messageTooLong);
  });

  it("allows exactly 2000 characters and an empty message", () => {
    expect(validateStepTwo({ ...validState(), message: "x".repeat(2000) })).toEqual({});
    expect(validateStepTwo({ ...validState(), message: "" })).toEqual({});
  });

  it("collects every failing field at once", () => {
    const errors = validateStepTwo({
      ...validState(),
      email: "nope",
      acceptedPrivacy: false,
      message: "x".repeat(2001),
    });
    expect(errors).toEqual({
      email: strings.probetraining.emailInvalid,
      acceptedPrivacy: strings.probetraining.privacyRequired,
      message: strings.probetraining.messageTooLong,
    });
  });
});

describe("buildRequestBody", () => {
  it("builds a body the contract schema accepts (single source of truth)", () => {
    const body = buildRequestBody(validState());
    expect(body).not.toBeNull();
    expect(probetrainingRequestSchema.safeParse(body).success).toBe(true);
  });

  it("maps the legacy field names: email→mail, didPlay tab value→boolean", () => {
    const body = buildRequestBody({ ...validState(), didPlay: "1" });
    expect(body).toMatchObject({
      month: "Januar",
      year: 2021,
      didPlay: true,
      gender: "weiblich",
      mail: "eltern@example.com",
      message: "Wir freuen uns!",
      acceptedPrivacy: true,
    });
    expect(buildRequestBody(validState())?.didPlay).toBe(false);
  });

  it("omits an empty message like the untouched legacy textarea", () => {
    const body = buildRequestBody({ ...validState(), message: "" });
    expect(body?.message).toBeUndefined();
    expect(body ? "message" in body : true).toBe(false);
  });

  it("returns null when the state does not satisfy the contract", () => {
    expect(buildRequestBody({ ...validState(), gender: null })).toBeNull();
    expect(buildRequestBody({ ...validState(), email: "nope" })).toBeNull();
  });

  it("passes a filled honeypot through unvalidated so the server can fake-accept it", () => {
    const body = buildRequestBody({ ...validState(), website: "https://spam.example" });
    expect(body?.website).toBe("https://spam.example");
    // The contract admits only the empty honeypot — the pass-through is deliberate.
    expect(probetrainingRequestSchema.safeParse(body).success).toBe(false);
  });

  it("keeps the empty honeypot on the wire", () => {
    expect(buildRequestBody(validState())?.website).toBe("");
  });
});

describe("didPlayLabel", () => {
  it("renders the legacy tab labels", () => {
    expect(didPlayLabel("0")).toBe(strings.probetraining.didPlayNo);
    expect(didPlayLabel("1")).toBe(strings.probetraining.didPlayYes);
  });
});

describe("submitProbetraining", () => {
  const body = buildRequestBody(validState());
  if (body === null) throw new Error("fixture must satisfy the contract");

  it("POSTs the JSON body to /public/probetraining and reports success on 201", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    const outcome = await submitProbetraining(body, {
      baseUrl: "https://api.example",
      fetchImpl,
    });

    expect(outcome).toBe("success");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/public/probetraining");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("reports rate_limited on 429", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests", code: "RATE_LIMITED" }), {
          status: 429,
        }),
      );
    await expect(
      submitProbetraining(body, { baseUrl: "https://api.example", fetchImpl }),
    ).resolves.toBe("rate_limited");
  });

  it("reports error on any other non-2xx answer", async () => {
    for (const status of [400, 500]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
      await expect(
        submitProbetraining(body, { baseUrl: "https://api.example", fetchImpl }),
      ).resolves.toBe("error");
    }
  });

  it("reports error when the network request throws", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      submitProbetraining(body, { baseUrl: "https://api.example", fetchImpl }),
    ).resolves.toBe("error");
  });
});
