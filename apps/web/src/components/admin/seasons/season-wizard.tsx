"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import type { BrowsableLeague } from "@dragons/shared";
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
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Badge } from "@dragons/ui/components/badge";

type Step = "name" | "select" | "syncing" | "done";

export function SeasonWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [leagues, setLeagues] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  // The federation league fetch paginates ~hundreds of leagues, so both async
  // steps need visible progress; without it the dialog reads as frozen.
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The season is created only on final confirm; this id lets a retry after a
  // mid-confirm failure reuse the created season instead of making a duplicate.
  const [createdId, setCreatedId] = useState<number | null>(null);
  // Tracks the live `open` prop so async handlers can bail out of applying
  // state to a dialog the user has already closed mid-flight.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  function reset() {
    setStep("name");
    setName("");
    setLeagues([]);
    setSelected(new Set());
    setFilter("");
    setLoadingLeagues(false);
    setSubmitting(false);
    setCreatedId(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  // Browse vorabliga leagues from the federation. Nothing is persisted yet —
  // the season does not exist until the user confirms their selection.
  async function loadLeagues() {
    setStep("select");
    setLoadingLeagues(true);
    try {
      const found = await api.seasons.browse({ vorabligaOnly: true });
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

  // Final commit: create the season, persist the picked leagues, then sync.
  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      let id = createdId;
      if (id === null) {
        const season = await api.seasons.create({ name });
        id = season.id;
        setCreatedId(id);
      }
      await api.seasons.setLeagues(id, { ligaIds: [...selected] });
      setStep("syncing");
      try {
        await api.sync.trigger();
        toast.success(t("settings.seasons.wizard.synced"));
      } catch {
        // The season and its leagues are saved; only the sync kick-off failed.
        toast.error(t("settings.seasons.wizard.syncFailed"));
      }
      await mutate(SWR_KEYS.seasons);
      setStep("done");
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter((l) =>
      [l.name, l.skName, l.akName, l.geschlecht].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [leagues, filter]);

  const description =
    step === "select"
      ? t("settings.seasons.wizard.selectDescription")
      : t("settings.seasons.wizard.nameDescription");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
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
            {loadingLeagues ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("settings.seasons.wizard.loadingLeagues")}
              </div>
            ) : leagues.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("settings.seasons.wizard.noLeagues")}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t("settings.seasons.wizard.searchPlaceholder")}
                    aria-label={t("settings.seasons.wizard.searchPlaceholder")}
                  />
                  <Badge variant="secondary" className="shrink-0">
                    {t("settings.seasons.wizard.selectedCount", { count: selected.size })}
                  </Badge>
                </div>
                <ul className="max-h-72 overflow-auto rounded-md bg-surface-low p-1">
                  {filtered.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {t("settings.seasons.wizard.noMatches")}
                    </li>
                  ) : (
                    filtered.map((l) => (
                      <li key={l.ligaId}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-high">
                          <Checkbox
                            className="mt-0.5"
                            checked={selected.has(l.ligaId)}
                            onCheckedChange={(c) => toggle(l.ligaId, c === true)}
                          />
                          <span className="flex flex-col">
                            <span className="text-sm font-medium">{l.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {[l.skName, l.akName, l.geschlecht].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
                <DialogFooter>
                  <Button disabled={selected.size === 0 || submitting} onClick={() => { void confirm(); }}>
                    {submitting && <Loader2 className="size-4 animate-spin" />}
                    {t("settings.seasons.wizard.confirm")}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {step === "syncing" && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("settings.seasons.wizard.syncing")}
          </div>
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
