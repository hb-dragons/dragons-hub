/**
 * React island port of dragons-app `app/components/probetraining/Form.vue`:
 * the two-step Probetraining request flow (step 1 month/year/didPlay/gender,
 * step 2 email/message/privacy consent) with the result step behind it, plus
 * the hidden `website` honeypot the legacy form predates. All validation and
 * submit logic lives in `lib/probetraining-form.ts` (contract-schema-backed,
 * unit-tested); this component only renders state.
 */
import { useState } from "react";
import { Button } from "@dragons/ui";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { Textarea } from "@dragons/ui/components/textarea";
import { DEFAULT_API_BASE } from "../../lib/api-base";
import {
  buildRequestBody,
  didPlayLabel,
  GENDERS,
  initialFormState,
  MONTHS,
  submitProbetraining,
  validateStepOne,
  validateStepTwo,
  yearOptions,
  type DidPlay,
  type Gender,
  type Month,
  type ProbetrainingFormState,
  type StepOneErrors,
  type StepTwoErrors,
} from "../../lib/probetraining-form";
import { strings } from "../../lib/strings";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? DEFAULT_API_BASE;

const t = strings.probetraining;

/* Legacy UStepper icons (lucide circle-question-mark / send / check-circle). */

function QuestionIcon() {
  return (
    <svg
      width="1.25em"
      height="1.25em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="1.25em"
      height="1.25em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function AtSignIcon() {
  return (
    <svg
      className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

const STEPS = [
  { label: t.stepAriaLabels.info, Icon: QuestionIcon },
  { label: t.stepAriaLabels.request, Icon: SendIcon },
  { label: t.stepAriaLabels.done, Icon: CheckCircleIcon },
] as const;

/** The legacy UStepper band: three icon circles joined by progress bars. */
function StepperHeader({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex w-full items-center">
      {STEPS.map(({ label, Icon }, index) => (
        <li
          key={label}
          aria-current={step === index ? "step" : undefined}
          className={index < STEPS.length - 1 ? "flex flex-1 items-center gap-2" : "flex items-center"}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon />
            <span className="sr-only">{label}</span>
          </span>
          {index < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className={`mx-2 h-0.5 flex-1 rounded-full transition-colors ${
                index < step ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** The legacy summary card (step 2 recap + result step). */
function SummaryBox({
  form,
  withContact,
}: {
  form: ProbetrainingFormState;
  withContact: boolean;
}) {
  return (
    <div className="bg-muted space-y-1 rounded-md border p-1">
      <div>
        <p className="text-muted-foreground text-xs font-bold">{t.summaryBirthdate}</p>
        <p className="text-sm">
          {form.month} {form.year}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-bold">{t.genderLabel}</p>
        <p className="text-sm">{form.gender}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-bold">{t.summaryDidPlay}</p>
        <p className="text-sm">{didPlayLabel(form.didPlay)}</p>
      </div>
      {withContact && (
        <>
          <div>
            <p className="text-muted-foreground text-xs font-bold">{t.summaryEmail}</p>
            <p className="text-sm">{form.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-bold">{t.summaryMessage}</p>
            <p className="text-sm whitespace-pre-line">{form.message}</p>
          </div>
        </>
      )}
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return <p className="text-destructive mt-1 text-sm">{message}</p>;
}

export default function FormIsland() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProbetrainingFormState>(() => initialFormState());
  const [stepOneErrors, setStepOneErrors] = useState<StepOneErrors>({});
  const [stepTwoErrors, setStepTwoErrors] = useState<StepTwoErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<"error" | "rate_limited" | null>(null);

  const patch = (changes: Partial<ProbetrainingFormState>) =>
    setForm((prev) => ({ ...prev, ...changes }));

  function handleStepOneSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateStepOne(form);
    setStepOneErrors(errors);
    if (Object.keys(errors).length === 0) setStep(1);
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateStepTwo(form);
    setStepTwoErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Both steps validated against the contract, so this cannot fail; the
    // toast is the safety net against a silent dead submit button if it ever
    // does.
    const body = buildRequestBody(form);
    if (body === null) {
      setToast("error");
      return;
    }

    setSubmitting(true);
    setToast(null);
    const outcome = await submitProbetraining(body, { baseUrl: API_BASE });
    setSubmitting(false);

    if (outcome === "success") {
      setStep(2);
      return;
    }
    setToast(outcome);
  }

  return (
    <div className="relative mx-auto max-w-xl">
      <StepperHeader step={step} />

      {/*
        Honeypot: in the DOM from the first paint, but moved off-canvas (not
        display:none — naive bots skip hidden inputs). Humans never see or tab
        into it; scripted form-fillers do, and the server fake-accepts any
        submission that fills it. Lives outside the step forms so it is
        present no matter which step renders.
      */}
      <div aria-hidden="true" className="absolute top-0 -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="pt-website">{t.honeypotLabel}</label>
        <input
          id="pt-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => patch({ website: event.target.value })}
        />
      </div>

      {step === 0 && (
        <form noValidate onSubmit={handleStepOneSubmit}>
          <div className="space-y-4 md:space-y-6">
            <div className="text-center text-base font-bold md:text-lg">{t.stepOneIntro}</div>

            <div className="grid grid-cols-1 items-center justify-center gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center gap-4">
                <div className="w-[150px] space-y-1.5">
                  <Label htmlFor="pt-month">{t.monthLabel}</Label>
                  <Select
                    value={form.month}
                    onValueChange={(value) => patch({ month: value as Month })}
                  >
                    <SelectTrigger id="pt-month" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month} value={month}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-[120px] space-y-1.5">
                  <Label htmlFor="pt-year">{t.yearLabel}</Label>
                  <Select
                    value={String(form.year)}
                    onValueChange={(value) => patch({ year: Number(value) })}
                  >
                    <SelectTrigger id="pt-year" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions().map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="w-[150px] space-y-1.5">
                  <Label htmlFor="pt-gender">{t.genderLabel}</Label>
                  <Select
                    value={form.gender ?? undefined}
                    onValueChange={(value) => patch({ gender: value as Gender })}
                  >
                    <SelectTrigger
                      id="pt-gender"
                      className="w-full"
                      aria-invalid={stepOneErrors.gender !== undefined}
                    >
                      <SelectValue placeholder={t.genderPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((gender) => (
                        <SelectItem key={gender} value={gender}>
                          {gender}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={stepOneErrors.gender} />
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-center text-base font-bold md:text-lg">
                {t.didPlayQuestion}
              </h3>
              <div className="flex justify-center">
                <Tabs
                  value={form.didPlay}
                  onValueChange={(value) => patch({ didPlay: value as DidPlay })}
                  className="w-[150px]"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="0">{t.didPlayNo}</TabsTrigger>
                    <TabsTrigger value="1">{t.didPlayYes}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <Button type="submit">
              {t.next}
              <ArrowRightIcon />
            </Button>
          </div>
        </form>
      )}

      {step === 1 && (
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-4">
            <SummaryBox form={form} withContact={false} />

            <div className="w-full space-y-1.5">
              <Label htmlFor="pt-email">{t.emailLabel}</Label>
              <div className="relative">
                <AtSignIcon />
                <Input
                  id="pt-email"
                  type="email"
                  className="pl-8"
                  value={form.email}
                  aria-invalid={stepTwoErrors.email !== undefined}
                  onChange={(event) => patch({ email: event.target.value })}
                />
              </div>
              <FieldError message={stepTwoErrors.email} />
            </div>

            <div className="w-full space-y-1.5">
              <Label htmlFor="pt-message">{t.messageLabel}</Label>
              <Textarea
                id="pt-message"
                rows={6}
                value={form.message}
                aria-invalid={stepTwoErrors.message !== undefined}
                onChange={(event) => patch({ message: event.target.value })}
              />
              <FieldError message={stepTwoErrors.message} />
            </div>

            <div className="w-full space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pt-privacy"
                  checked={form.acceptedPrivacy}
                  aria-invalid={stepTwoErrors.acceptedPrivacy !== undefined}
                  onCheckedChange={(checked) => patch({ acceptedPrivacy: checked === true })}
                />
                <Label htmlFor="pt-privacy">{t.privacyLabel}</Label>
              </div>
              <FieldError message={stepTwoErrors.acceptedPrivacy} />
            </div>

            <div className="mt-8 flex justify-center gap-4">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                <ArrowLeftIcon />
                {t.back}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <SpinnerIcon /> : null}
                {t.submit}
                <SendIcon />
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p>{t.successHeading}</p>
          <div>{t.successData}</div>
          <SummaryBox form={form} withContact={true} />
          <div className="mt-8 flex justify-center gap-4">
            <Button asChild>
              <a href="/">
                <ArrowLeftIcon />
                {t.backHome}
              </a>
            </Button>
          </div>
        </div>
      )}

      {toast !== null && (
        <div
          role="alert"
          className="bg-background fixed right-4 bottom-4 z-50 max-w-sm rounded-md border p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-destructive font-bold">{t.errorTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {toast === "rate_limited" ? t.rateLimitedMessage : t.errorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.dismissError}
              onClick={() => setToast(null)}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
