"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTimeAgo } from "./use-time-ago";
import { useTranslations } from "next-intl";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { api, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Trash2, Plus } from "lucide-react";
import type { RefereeListItem } from "@dragons/shared";

interface Rule { teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }

interface Props { referee: RefereeListItem }

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function RulesSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.rules");
  const tSave = useTranslations("refereeHub.referees.rules.save");

  const teamsQ = queries.teams();
  const refereeRulesQ = queries.refereeRules(referee.id);

  const { data: teamsData = [] } = useSWR(SWR_KEYS.teams, teamsQ.fetcher);
  const { data: rulesData } = useSWR(SWR_KEYS.refereeRules(referee.id), refereeRulesQ.fetcher);

  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (rulesData?.rules) {
      setRules(rulesData.rules);
      setStatus("idle");
      setErrorMsg(null);
    }
  }, [rulesData, referee.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function markDirty() {
    setStatus("dirty");
    setErrorMsg(null);
  }

  function addRule() {
    setRules((r) => [...r, { teamId: teamsData[0]?.id ?? 0, deny: false, allowSr1: false, allowSr2: true }]);
    markDirty();
  }

  function updateRule(i: number, p: Partial<Rule>) {
    setRules((r) => r.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
    markDirty();
  }

  function removeRule(i: number) {
    setRules((r) => r.filter((_, idx) => idx !== i));
    markDirty();
  }

  function discard() {
    setRules(rulesData?.rules ?? []);
    setStatus("idle");
    setErrorMsg(null);
  }

  async function save() {
    setStatus("saving");
    try {
      await api.refereeAdmin.updateRules(referee.id, {
        rules: rules.filter((r) => r.deny || r.allowSr1 || r.allowSr2),
      });
      await swrMutate(SWR_KEYS.refereeRules(referee.id));
      await swrMutate((key) => typeof key === "string" && key.startsWith("/admin/referees?"), undefined, { revalidate: true });
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (err) {
      const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : "Save failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  }

  const isDirty = status === "dirty" || status === "error";
  const saveDisabled = status === "idle" || status === "saving" || status === "saved";
  const secondsAgo = useTimeAgo(lastSavedAt, status === "saved");

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but require returnValue or preventDefault.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (!referee.isOwnClub) {
    return (
      <div className="p-4 space-y-3 text-sm text-muted-foreground">
        <p>{t("disabledHint")}</p>
        <Button size="sm" variant="outline" onClick={() => {
          void (async () => {
            await api.refereeAdmin.setVisibility(referee.id, {
              isOwnClub: true,
              allowAllHomeGames: referee.allowAllHomeGames,
              allowAwayGames: referee.allowAwayGames,
            });
            await swrMutate(SWR_KEYS.referee(referee.id));
            await swrMutate((key) => typeof key === "string" && key.startsWith("/admin/referees?"), undefined, { revalidate: true });
            await swrMutate(SWR_KEYS.refereeCounts);
          })();
        }}>
          {t("markOwnClub")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("title")}</div>
        <Button size="sm" variant="outline" onClick={addRule}>
          <Plus className="h-3 w-3 mr-1" /> {t("add")}
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="text-sm text-muted-foreground py-2">{t("none")}</div>
      )}

      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 border rounded-md p-2">
            <Select value={String(rule.teamId)} onValueChange={(v) => updateRule(i, { teamId: Number(v) })}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={t("selectTeam")} /></SelectTrigger>
              <SelectContent>
                {teamsData.map((tm) => (
                  <SelectItem key={tm.id} value={String(tm.id)}>
                    {tm.customName ?? tm.name}{tm.leagueName && ` (${tm.leagueName})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={rule.deny ? "destructive" : "secondary"}
              onClick={() => updateRule(i, { deny: !rule.deny, allowSr1: !rule.deny ? false : rule.allowSr1, allowSr2: !rule.deny ? false : rule.allowSr2 })}
            >
              {rule.deny ? t("deny") : t("allow")}
            </Button>
            {!rule.deny && (
              <>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={rule.allowSr1} onCheckedChange={(v) => updateRule(i, { allowSr1: v === true })} /> SR1
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={rule.allowSr2} onCheckedChange={(v) => updateRule(i, { allowSr2: v === true })} /> SR2
                </label>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => removeRule(i)} aria-label="remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background border-t flex items-center justify-between text-xs">
        <span className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
          {status === "saving" ? tSave("saving") :
           status === "dirty"  ? tSave("dirty") :
           status === "saved"  ? tSave("saved", { n: String(secondsAgo) }) :
           status === "error"  ? tSave("error", { msg: errorMsg ?? "" }) :
           ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!isDirty} onClick={discard}>{tSave("discard")}</Button>
          <Button size="sm" disabled={saveDisabled} onClick={() => void save()}>{tSave("save")}</Button>
        </div>
      </div>
    </div>
  );
}
