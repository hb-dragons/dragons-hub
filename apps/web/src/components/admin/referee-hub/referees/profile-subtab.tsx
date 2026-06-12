"use client";

import { useEffect, useState } from "react";
import { mutate as swrMutate } from "swr";
import { useTranslations } from "next-intl";
import { SWR_KEYS } from "@/lib/swr-keys";
import { api } from "@/lib/api";
import { useAutoSave } from "./use-auto-save";
import { useTimeAgo } from "./use-time-ago";
import { Switch } from "@dragons/ui/components/switch";
import { Label } from "@dragons/ui/components/label";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

export function ProfileSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.profile");
  const [visibility, setVisibility] = useState({
    isOwnClub: referee.isOwnClub,
    allowAllHomeGames: referee.allowAllHomeGames,
    allowAwayGames: referee.allowAwayGames,
  });

  /* eslint-disable react-hooks/set-state-in-effect */
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
      await api.refereeAdmin.setVisibility(referee.id, visibility);
      await Promise.all([
        swrMutate(SWR_KEYS.referee(referee.id)),
        swrMutate((key) => typeof key === "string" && key.startsWith("/admin/referees?"), undefined, { revalidate: true }),
        swrMutate(SWR_KEYS.refereeCounts),
      ]);
    },
  });

  function patchVisibility(p: Partial<typeof visibility>) {
    setVisibility((v) => ({ ...v, ...p }));
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

      <SaveStatusBar status={status} lastSavedAt={lastSavedAt} onSaveNow={() => void saveNow()} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SaveStatusBar({ status, lastSavedAt, onSaveNow }: { status: string; lastSavedAt: number | null; onSaveNow: () => void }) {
  const t = useTranslations("refereeHub.referees.profile.save");
  const secondsAgo = useTimeAgo(lastSavedAt, status === "saved");
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
