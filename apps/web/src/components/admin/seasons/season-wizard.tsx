"use client";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import type { BrowsableLeague } from "@dragons/shared";
import { Dialog, DialogContent } from "@dragons/ui/components/dialog";
import { Input } from "@dragons/ui/components/input";
import { Button } from "@dragons/ui/components/button";

type Step = "name" | "discover" | "syncing" | "done";

export function SeasonWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [leagues, setLeagues] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function createAndDiscover() {
    const season = await api.seasons.create({ name });
    setSeasonId(season.id);
    const found = await api.seasons.discover(season.id, { vorabligaOnly: true });
    setLeagues(found);
    setStep("discover");
  }

  async function saveAndSync() {
    if (seasonId === null) return;
    await api.seasons.setLeagues(seasonId, { ligaIds: [...selected] });
    setStep("syncing");
    try {
      await api.sync.trigger();
      await mutate(SWR_KEYS.seasons);
      setStep("done");
      toast.success(t("settings.seasons.wizard.synced"));
    } catch {
      toast.error(t("settings.seasons.wizard.syncFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "name" && (
          <div className="space-y-3">
            <label htmlFor="season-name">{t("settings.seasons.wizard.nameLabel")}</label>
            <Input id="season-name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={!name.trim()} onClick={() => { void createAndDiscover(); }}>
              {t("settings.seasons.wizard.next")}
            </Button>
          </div>
        )}
        {step === "discover" && (
          <div className="space-y-2">
            {leagues.map((l) => (
              <label key={l.ligaId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(l.ligaId)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.ligaId); else next.delete(l.ligaId);
                      return next;
                    });
                  }}
                />
                <span>{l.name} · {l.skName} · {l.akName} · {l.geschlecht}</span>
              </label>
            ))}
            <Button disabled={selected.size === 0} onClick={() => { void saveAndSync(); }}>
              {t("settings.seasons.wizard.saveAndSync")}
            </Button>
          </div>
        )}
        {step === "syncing" && <p>{t("settings.seasons.wizard.syncing")}</p>}
        {step === "done" && <p>{t("settings.seasons.wizard.done")}</p>}
      </DialogContent>
    </Dialog>
  );
}
