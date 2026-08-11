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
// ~5 minutes at POLL_INTERVAL_MS — a run that never appears in the tracked
// page or never reaches a terminal status must not poll forever.
const MAX_POLL_ATTEMPTS = 150;
// A single 500/network blip must not strand the wizard; only give up after
// several in a row.
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

export function SeasonWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
  // MAX_POLL_ATTEMPTS in case the run never appears or never goes terminal.
  const waitForRun = useCallback(async (runId: number) => {
    let consecutiveFailures = 0;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (!openRef.current || !mountedRef.current) return;
      try {
        const page = await api.sync.logs({ limit: 20, offset: 0 });
        consecutiveFailures = 0;
        const run = page.items.find((r) => r.id === runId);
        if (run && run.status !== "running" && run.status !== "pending") return;
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }, []);

  const finishWithSummary = useCallback(
    async (id: number) => {
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
      if (openRef.current && mountedRef.current) setStep("done");
    },
    [mutate],
  );

  // Passed to SyncLiveLogs as `onComplete`. SyncLiveLogs's stream effect has
  // `onComplete` in its deps, so this must stay referentially stable across
  // renders — an inline arrow here would tear down and reopen the
  // EventSource on every render (e.g. finishWithSummary's own setSummary
  // triggers one while still on the syncing step). createdId/syncRunId are
  // read from refs rather than closed-over state for the same reason. It's
  // also non-async and stays synchronous so it can be passed directly to a
  // prop typed `() => void`, and completingRef guards against the stream
  // re-firing "complete" a second time.
  const handleSyncStreamComplete = useCallback(() => {
    if (completingRef.current) return;
    const id = createdIdRef.current;
    const runId = syncRunIdRef.current;
    if (id === null || runId === null) return;
    completingRef.current = true;
    void (async () => {
      try {
        await waitForRun(runId);
        if (!openRef.current || !mountedRef.current) return;
        await finishWithSummary(id);
      } finally {
        completingRef.current = false;
      }
    })();
  }, [waitForRun, finishWithSummary]);

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
        toast.error(t("settings.seasons.wizard.syncFailed"));
        await finishWithSummary(id);
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
            <p className="text-sm">{t("settings.seasons.wizard.done")}</p>
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
