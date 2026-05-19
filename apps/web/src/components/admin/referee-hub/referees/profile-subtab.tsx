"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { useAutoSave } from "./use-auto-save";
import { Switch } from "@dragons/ui/components/switch";
import { Label } from "@dragons/ui/components/label";
import { Button } from "@dragons/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Trash2, Plus } from "lucide-react";
import type { RefereeListItem } from "@dragons/shared";

interface Team { id: number; name: string; customName: string | null; leagueName: string | null }
interface Rule { teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }
interface RulesResp { rules: Rule[] }

interface Props { referee: RefereeListItem }

export function ProfileSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.profile");
  const [visibility, setVisibility] = useState({
    isOwnClub: referee.isOwnClub,
    allowAllHomeGames: referee.allowAllHomeGames,
    allowAwayGames: referee.allowAwayGames,
  });
  const [rules, setRules] = useState<Rule[]>([]);

  const { data: teamsData = [] } = useSWR<Team[]>(SWR_KEYS.teams, apiFetcher);
  const { data: rulesData } = useSWR<RulesResp>(SWR_KEYS.refereeRules(referee.id), apiFetcher);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (rulesData?.rules) setRules(rulesData.rules);
  }, [rulesData]);

  useEffect(() => {
    setVisibility({
      isOwnClub: referee.isOwnClub,
      allowAllHomeGames: referee.allowAllHomeGames,
      allowAwayGames: referee.allowAwayGames,
    });
  }, [referee.id, referee.isOwnClub, referee.allowAllHomeGames, referee.allowAwayGames]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { status, lastSavedAt, markDirty, saveNow } = useAutoSave({
    save: async () => {
      await Promise.all([
        fetchAPI(`/admin/referees/${referee.id}/visibility`, {
          method: "PATCH",
          body: JSON.stringify(visibility),
        }),
        fetchAPI(`/admin/referees/${referee.id}/rules`, {
          method: "PATCH",
          body: JSON.stringify({ rules: rules.filter((r) => r.deny || r.allowSr1 || r.allowSr2) }),
        }),
      ]);
      await Promise.all([
        swrMutate(SWR_KEYS.refereeRules(referee.id)),
        swrMutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 })),
      ]);
    },
  });

  function patchVisibility(p: Partial<typeof visibility>) {
    setVisibility((v) => ({ ...v, ...p }));
    markDirty();
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

  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{t("visibility.title")}</div>
        <Row label={t("visibility.ownClub")}>
          <Switch checked={visibility.isOwnClub} onCheckedChange={(v) => patchVisibility({ isOwnClub: v })} aria-label={t("visibility.ownClub")} />
        </Row>
        <Row label={t("visibility.allHome")}>
          <Switch checked={visibility.allowAllHomeGames} onCheckedChange={(v) => patchVisibility({ allowAllHomeGames: v })} aria-label={t("visibility.allHome")} />
        </Row>
        <Row label={t("visibility.away")}>
          <Switch checked={visibility.allowAwayGames} onCheckedChange={(v) => patchVisibility({ allowAwayGames: v })} aria-label={t("visibility.away")} />
        </Row>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("rules.title")}</div>
          <Button size="sm" variant="outline" onClick={addRule}>
            <Plus className="h-3 w-3 mr-1" /> {t("rules.add")}
          </Button>
        </div>
        {rules.length === 0 && (
          <div className="text-sm text-muted-foreground py-2">{t("rules.none")}</div>
        )}
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2 border rounded-md p-2">
              <Select value={String(rule.teamId)} onValueChange={(v) => updateRule(i, { teamId: Number(v) })}>
                <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={t("rules.selectTeam")} /></SelectTrigger>
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
                {rule.deny ? t("rules.deny") : t("rules.allow")}
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
      </section>

      <SaveStatusBar status={status} lastSavedAt={lastSavedAt} onSaveNow={() => void saveNow()} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <Label className="text-sm">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SaveStatusBar({ status, lastSavedAt, onSaveNow }: { status: string; lastSavedAt: number | null; onSaveNow: () => void }) {
  const t = useTranslations("refereeHub.referees.profile.save");
  // eslint-disable-next-line react-hooks/purity
  const secondsAgo = lastSavedAt ? Math.max(1, Math.floor((Date.now() - lastSavedAt) / 1000)) : 0;
  const text =
    status === "saving" ? t("saving") :
    status === "dirty" ? t("dirty") :
    status === "error" ? t("error") :
    status === "saved" ? t("saved", { n: String(secondsAgo) }) :
    "";
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{text}</span>
      <Button size="sm" variant="outline" onClick={onSaveNow}>{t("now")}</Button>
    </div>
  );
}
