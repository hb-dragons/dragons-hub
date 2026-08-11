"use client";
import { useEffect, useRef, useState } from "react";
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
import { Button } from "@dragons/ui/components/button";
import { LeaguePicker } from "./league-picker";

export function ManageLeaguesDialog({
  seasonId,
  open,
  onOpenChange,
}: {
  seasonId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const [leagues, setLeaguesState] = useState<BrowsableLeague[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [ownClubOnly, setOwnClubOnly] = useState(true);
  // Off by default: mid-season the leagues being added are committed ones,
  // and the federation clears their `vorabliga` flag once they are.
  const [vorabligaOnly, setVorabligaOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Load the season's current leagues plus the browse candidates, then merge so
  // a currently-tracked league that the active filter would hide still appears
  // (checked) and can be removed.
  async function load(clubOnly = ownClubOnly, vorabOnly = vorabligaOnly, seed = false) {
    setLoading(true);
    try {
      const [tracked, candidates] = await Promise.all([
        api.seasons.getLeagues(seasonId),
        api.seasons.discover(seasonId, { vorabligaOnly: vorabOnly, ownClubOnly: clubOnly }),
      ]);
      if (!openRef.current) return;
      const trackedIds = new Set(tracked.leagues.map((l) => l.apiLigaId));
      const byId = new Map<number, BrowsableLeague>();
      for (const c of candidates) byId.set(c.ligaId, c);
      // Ensure tracked leagues missing from the candidate list are still shown.
      for (const l of tracked.leagues) {
        if (!byId.has(l.apiLigaId)) {
          byId.set(l.apiLigaId, {
            ligaId: l.apiLigaId,
            ligaNr: l.ligaNr,
            name: l.name,
            skName: "",
            akName: "",
            geschlecht: "",
            vorabliga: false,
            alreadyTracked: true,
          });
        }
      }
      setLeaguesState([...byId.values()]);
      if (seed) setSelected(trackedIds);
    } catch {
      if (!openRef.current) return;
      toast.error(t("settings.seasons.manage.loadFailed"));
    } finally {
      if (openRef.current) setLoading(false);
    }
  }

  // Load once each time the dialog opens.
  useEffect(() => {
    if (open) {
      setFilter("");
      setOwnClubOnly(true);
      setVorabligaOnly(false);
      void load(true, false, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seasonId]);

  function toggleOwnClubOnly(v: boolean) {
    setOwnClubOnly(v);
    void load(v);
  }

  function toggleVorabligaOnly(v: boolean) {
    setVorabligaOnly(v);
    void load(ownClubOnly, v);
  }

  function toggle(ligaId: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ligaId);
      else next.delete(ligaId);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.seasons.setLeagues(seasonId, { ligaIds: [...selected] });
      try {
        await api.sync.trigger();
      } catch {
        // Leagues are saved; only the sync kick-off failed.
      }
      await mutate(SWR_KEYS.seasons);
      toast.success(t("settings.seasons.manage.saved"));
      onOpenChange(false);
    } catch {
      toast.error(t("settings.seasons.manage.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (saving) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.seasons.manage.title")}</DialogTitle>
          <DialogDescription>{t("settings.seasons.manage.description")}</DialogDescription>
        </DialogHeader>
        <LeaguePicker
          leagues={leagues}
          selected={selected}
          onToggle={toggle}
          filter={filter}
          onFilterChange={setFilter}
          ownClubOnly={ownClubOnly}
          onOwnClubOnlyChange={toggleOwnClubOnly}
          vorabligaOnly={vorabligaOnly}
          onVorabligaOnlyChange={toggleVorabligaOnly}
          loading={loading}
        />
        <DialogFooter>
          <Button disabled={saving || loading} onClick={() => { void save(); }}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("settings.seasons.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
