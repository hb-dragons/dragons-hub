"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import type { BrowsableLeague, SeasonSummary } from "@dragons/shared";
import { SyncLiveLogs } from "@/components/admin/sync/sync-live-logs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@dragons/ui/components/dialog";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";
import { LeaguePicker } from "./league-picker";

type Step = "name" | "select" | "syncing" | "done";

const POLL_INTERVAL_MS = 2000;
// ~30 minutes at POLL_INTERVAL_MS. The poll is the only thing that ends the
// sync step, and a full federation sync runs for minutes, so the cap has to sit
// well past a realistic run — it exists to stop an orphaned wizard polling
// forever, not to time a normal sync out.
const MAX_POLL_ATTEMPTS = 900;
// A single 500/network blip must not strand the wizard; only give up after
// several in a row.
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

/**
 * How the wait for the sync run ended. The three non-terminal exits must stay
 * distinguishable from `terminal`: the counts are only trustworthy once the run
 * has actually finished, which is the entire reason the wizard waits at all.
 */
type RunOutcome = "terminal" | "timeout" | "unreadable" | "aborted";

/**
 * Sleeps between polls, but hands out a `wake` that cuts the wait short. The
 * log stream's "complete" event uses it to make the next poll immediate.
 */
function sleepUntilNextPoll(ms: number, register: (wake: () => void) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    register(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function SeasonWizard({
  open,
  onOpenChange,
  // Poll tuning, overridable so tests do not spend real seconds waiting. The
  // app never passes either.
  pollIntervalMs = POLL_INTERVAL_MS,
  maxPollAttempts = MAX_POLL_ATTEMPTS,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leagues, setLeagues] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  // Default to our own club's leagues — onboarding almost always tracks the
  // club's own teams, and the unfiltered federation list runs to hundreds.
  const [ownClubOnly, setOwnClubOnly] = useState(true);
  // The federation league fetch paginates ~hundreds of leagues, so both async
  // steps need visible progress; without it the dialog reads as frozen.
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The season is created only on final confirm; this id lets a retry after a
  // mid-confirm failure reuse the created season instead of making a duplicate.
  const [createdId, setCreatedId] = useState<number | null>(null);
  // The triggered run, so step 4 can stream its log. `null` means the sync was
  // never kicked off (the trigger call failed) — the review still renders.
  const [syncRunId, setSyncRunId] = useState<number | null>(null);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  // True when the review is being shown without having seen the run finish, so
  // the counts may be mid-sync. Rendered as a caveat rather than passed off as
  // the final figures.
  const [provisional, setProvisional] = useState(false);
  // Tracks the live `open` prop so async handlers can bail out of applying
  // state to a dialog the user has already closed mid-flight.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // Tracks whether the component is still mounted. `openRef` only reacts to
  // the `open` prop changing, so it stays `true` if the wizard is unmounted
  // outright (e.g. the admin navigates away mid-sync) — the poll loop needs
  // its own signal to stop in that case.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Mirror createdId/syncRunId into refs so the SyncLiveLogs onComplete
  // handler can stay referentially stable (see handleSyncStreamComplete)
  // without reading stale state from an earlier render's closure.
  const createdIdRef = useRef<number | null>(null);
  useEffect(() => {
    createdIdRef.current = createdId;
  }, [createdId]);
  const syncRunIdRef = useRef<number | null>(null);
  useEffect(() => {
    syncRunIdRef.current = syncRunId;
  }, [syncRunId]);
  // Guards against a second, concurrent run of handleSyncStreamComplete —
  // SyncLiveLogs's effect deps include `onComplete`, so if that identity
  // ever changes while still connected it reopens the stream and can fire
  // "complete" a second time.
  const completingRef = useRef(false);
  // Set while the poll loop is waiting out an interval; calling it polls now.
  const wakeRef = useRef<(() => void) | null>(null);

  function reset() {
    setStep("name");
    setName("");
    setLeagues([]);
    setSelected(new Set());
    setFilter("");
    setOwnClubOnly(true);
    setLoadingLeagues(false);
    setSubmitting(false);
    setCreatedId(null);
    setSyncRunId(null);
    setSummary(null);
    setProvisional(false);
    completingRef.current = false;
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  // Browse the upcoming season's leagues from the federation: the vorabligas
  // plus the top tiers (Regionalliga) that are never flagged vorabliga. Nothing
  // is persisted yet — the season does not exist until the user confirms.
  async function loadLeagues(clubOnly = ownClubOnly) {
    setStep("select");
    setLoadingLeagues(true);
    try {
      const found = await api.seasons.browse({ vorabligaOnly: true, ownClubOnly: clubOnly });
      if (!openRef.current) return; // closed mid-fetch — don't resurrect stale state
      setLeagues(found);
    } catch {
      if (!openRef.current) return;
      toast.error(t("settings.seasons.wizard.discoverFailed"));
      setStep("name");
    } finally {
      if (openRef.current) setLoadingLeagues(false);
    }
  }

  // Re-browse when the club filter is toggled. The toggle stays visible even
  // when the filtered list is empty, so the user can always switch it back off.
  function toggleOwnClubOnly(v: boolean) {
    setOwnClubOnly(v);
    void loadLeagues(v);
  }

  // The SSE "complete" event can fire before the job has started processing, so
  // it is not proof the sync is done. Poll the run the way the sync dashboard's
  // SyncCompletionWatcher does — until its status is neither running nor
  // pending — before trusting any counts. The wizard lives outside
  // SyncRunProvider, so it cannot reuse that watcher.
  //
  // A failed fetch (a 500/network blip during a multi-minute sync) must not
  // throw out of the loop as an unhandled rejection and strand the wizard on
  // the log panel forever — it's swallowed and retried, up to
  // MAX_CONSECUTIVE_POLL_FAILURES in a row. The whole wait is also capped at
  // maxPollAttempts in case the run never appears or never goes terminal.
  // Every exit is reported, because giving up and finishing are different
  // things to show the admin.
  const waitForRun = useCallback(
    async (runId: number): Promise<RunOutcome> => {
      let consecutiveFailures = 0;
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        // Wait before the first poll too: the run has only just been queued,
        // and the log stream's "complete" event can cut this short.
        await sleepUntilNextPoll(pollIntervalMs, (wake) => {
          wakeRef.current = wake;
        });
        wakeRef.current = null;
        if (!openRef.current || !mountedRef.current) return "aborted";
        try {
          const page = await api.sync.logs({ limit: 20, offset: 0 });
          consecutiveFailures = 0;
          const run = page.items.find((r) => r.id === runId);
          if (run && run.status !== "running" && run.status !== "pending") return "terminal";
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) return "unreadable";
        }
      }
      return "timeout";
    },
    [pollIntervalMs, maxPollAttempts],
  );

  const finishWithSummary = useCallback(
    async (id: number, options: { provisional: boolean }) => {
      try {
        const counts = await api.seasons.summary(id);
        if (!openRef.current || !mountedRef.current) return;
        setSummary(counts);
      } catch {
        // Counts are the nice-to-have; the season exists either way.
        if (!openRef.current || !mountedRef.current) return;
        setSummary(null);
      }
      await mutate(SWR_KEYS.seasons);
      if (!openRef.current || !mountedRef.current) return;
      setProvisional(options.provisional);
      setStep("done");
    },
    [mutate],
  );

  // Waits for the tracked run and then shows the review. Idempotent: whichever
  // of the two triggers below gets here first owns the flow.
  const startCompletion = useCallback(() => {
    if (completingRef.current) return;
    const id = createdIdRef.current;
    const runId = syncRunIdRef.current;
    if (id === null || runId === null) return;
    completingRef.current = true;
    void (async () => {
      try {
        const outcome = await waitForRun(runId);
        if (outcome === "aborted") return;
        if (!openRef.current || !mountedRef.current) return;
        // A timed-out or unreadable poll means we never saw the run finish, so
        // the counts may be mid-sync. Show them, but say so.
        await finishWithSummary(id, { provisional: outcome !== "terminal" });
      } finally {
        completingRef.current = false;
      }
    })();
  }, [waitForRun, finishWithSummary]);

  // Trigger 1, and the one that must always fire: reaching the sync step with a
  // run id. The stream's "complete" event cannot be the only way out — a
  // dropped SSE connection (proxy timeout, connection reset) or a run that
  // finished before the EventSource subscribed means it never arrives, and
  // SyncLiveLogs does not reconnect. That parked the wizard on the log panel
  // for good, with the seasons list behind it left stale.
  useEffect(() => {
    if (step !== "syncing" || syncRunId === null) return;
    startCompletion();
  }, [step, syncRunId, startCompletion]);

  // Trigger 2, an accelerator only. Passed to SyncLiveLogs as `onComplete`:
  // it wakes the poll loop so the next check is immediate instead of an
  // interval away. SyncLiveLogs's stream effect has `onComplete` in its deps,
  // so this must stay referentially stable across renders — an inline arrow
  // would tear down and reopen the EventSource on every render (e.g.
  // finishWithSummary's own setSummary triggers one while still on the syncing
  // step). createdId/syncRunId are read from refs for the same reason. It also
  // stays synchronous so it can be passed to a prop typed `() => void`.
  const handleSyncStreamComplete = useCallback(() => {
    wakeRef.current?.();
    startCompletion();
  }, [startCompletion]);

  // Final commit: create the season, persist the picked leagues, then sync.
  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      let id = createdId;
      if (id === null) {
        const season = await api.seasons.create({
          name,
          // The contract takes null for "not set"; an empty date input is "".
          startDate: startDate || null,
          endDate: endDate || null,
        });
        id = season.id;
        setCreatedId(id);
      }
      await api.seasons.setLeagues(id, { ligaIds: [...selected] });
      setStep("syncing");
      try {
        const run = await api.sync.trigger();
        if (!openRef.current) return;
        setSyncRunId(run.syncRunId);
        // Step 4 now owns the rest: it streams the run's log and advances once
        // the run is actually finished.
        return;
      } catch {
        // The season and its leagues are saved; only the sync kick-off failed.
        // Nothing is running, so the counts are final, not provisional.
        toast.error(t("settings.seasons.wizard.syncFailed"));
        await finishWithSummary(id, { provisional: false });
      }
    } catch {
      toast.error(t("settings.seasons.wizard.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(ligaId: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ligaId);
      else next.delete(ligaId);
      return next;
    });
  }

  const description =
    step === "select"
      ? t("settings.seasons.wizard.selectDescription")
      : t("settings.seasons.wizard.nameDescription");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={step === "syncing" ? "sm:max-w-3xl" : undefined}
        // While committing (create -> save leagues -> sync) the dialog must not
        // close: an interrupted commit would orphan the just-created season.
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.seasons.wizard.title")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === "name" && (
          <div className="space-y-3">
            <label htmlFor="season-name" className="text-sm font-medium">
              {t("settings.seasons.wizard.nameLabel")}
            </label>
            <Input
              id="season-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !loadingLeagues) void loadLeagues();
              }}
            />
            {/* Both optional. The federation does not publish season dates, so
                they are the admin's own note of when this season runs. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="season-start" className="text-sm font-medium">
                  {t("settings.seasons.wizard.startDateLabel")}
                </label>
                <Input
                  id="season-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="season-end" className="text-sm font-medium">
                  {t("settings.seasons.wizard.endDateLabel")}
                </label>
                <Input
                  id="season-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name.trim() || loadingLeagues} onClick={() => { void loadLeagues(); }}>
                {loadingLeagues && <Loader2 className="size-4 animate-spin" />}
                {t("settings.seasons.wizard.next")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-3">
            <LeaguePicker
              leagues={leagues}
              selected={selected}
              onToggle={toggle}
              filter={filter}
              onFilterChange={setFilter}
              ownClubOnly={ownClubOnly}
              onOwnClubOnlyChange={toggleOwnClubOnly}
              loading={loadingLeagues}
            />
            {!loadingLeagues && leagues.length > 0 && (
              <DialogFooter>
                <Button disabled={selected.size === 0 || submitting} onClick={() => { void confirm(); }}>
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {t("settings.seasons.wizard.confirm")}
                </Button>
              </DialogFooter>
            )}
          </div>
        )}

        {step === "syncing" && (
          syncRunId === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("settings.seasons.wizard.syncing")}
            </div>
          ) : (
            <SyncLiveLogs
              syncRunId={syncRunId}
              onComplete={handleSyncStreamComplete}
            />
          )
        )}

        {step === "done" && (
          <div className="space-y-4 py-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
              {t("settings.seasons.wizard.reviewTitle")}
            </h3>
            {/* We never saw the run finish, so these counts may be mid-sync.
                Saying nothing would present them as the final figures. */}
            {provisional && (
              <p className="text-sm text-muted-foreground">
                {t("settings.seasons.wizard.reviewProvisional")}
              </p>
            )}
            {summary === null ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.seasons.wizard.reviewUnavailable")}
              </p>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewLeagues")}
                    </dt>
                    <dd className="text-2xl font-semibold">{summary.leagueCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewGames")}
                    </dt>
                    <dd className="text-2xl font-semibold">{summary.gameCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("settings.seasons.wizard.reviewPlaceholders")}
                    </dt>
                    <dd className="text-2xl font-semibold">
                      {summary.placeholderSlots ?? "—"}
                    </dd>
                  </div>
                </dl>
                {/* Unassigned slots are why the game count trails the published
                    schedule, so say so rather than leaving a bare number. */}
                {summary.placeholderSlots !== null && summary.placeholderSlots > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.seasons.wizard.reviewPlaceholderHint")}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                {t("settings.seasons.wizard.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
