"use client";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { CalendarRange } from "lucide-react";
import type { SeasonStatus, SeasonWithCounts } from "@dragons/shared";
import { SeasonWizard } from "./season-wizard";
import { ManageLeaguesDialog } from "./manage-leagues-dialog";

const STATUS_VARIANT: Record<SeasonStatus, "success" | "secondary" | "outline"> = {
  active: "success",
  upcoming: "secondary",
  archived: "outline",
};

export function SeasonsList() {
  const t = useTranslations();
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);
  const { mutate } = useSWRConfig();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [manageSeasonId, setManageSeasonId] = useState<number | null>(null);
  // Held rather than passed straight to activate(): an empty season blanks the
  // public site, so it goes through a confirm first.
  const [pendingEmpty, setPendingEmpty] = useState<SeasonWithCounts | null>(null);

  async function activate(season: SeasonWithCounts) {
    try {
      await api.seasons.activate(season.id);
      await mutate(SWR_KEYS.seasons);
      toast.success(t("settings.seasons.toast.activated"));
    } catch {
      toast.error(t("settings.seasons.toast.activateFailed"));
    }
  }

  function requestActivate(season: SeasonWithCounts) {
    if (season.leagueCount === 0) {
      setPendingEmpty(season);
      return;
    }
    void activate(season);
  }

  const rows = seasons ?? [];

  return (
    <>
      <SeasonWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      {manageSeasonId !== null && (
        <ManageLeaguesDialog
          seasonId={manageSeasonId}
          open
          onOpenChange={(v) => {
            if (!v) setManageSeasonId(null);
          }}
        />
      )}

      <AlertDialog
        open={pendingEmpty !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEmpty(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.seasons.activate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.seasons.confirmEmptyActivate")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const season = pendingEmpty;
                setPendingEmpty(null);
                if (season) void activate(season);
              }}
            >
              {t("settings.seasons.activate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("settings.seasons.title")}</CardTitle>
          <Button onClick={() => setWizardOpen(true)}>
            {t("settings.seasons.createSeason")}
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CalendarRange className="mb-2 h-8 w-8" />
              <p>{t("settings.seasons.empty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.seasons.columns.name")}</TableHead>
                  <TableHead>{t("settings.seasons.columns.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("settings.seasons.columns.leagues")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("settings.seasons.columns.games")}
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id} className="hover:bg-surface-high">
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>
                        {t(`settings.seasons.status.${s.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.leagueCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.gameCount}</TableCell>
                    <TableCell className="text-right">
                      {s.status === "upcoming" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setManageSeasonId(s.id)}
                          >
                            {t("settings.seasons.manage.button")}
                          </Button>
                          <Button size="sm" onClick={() => requestActivate(s)}>
                            {t("settings.seasons.activate")}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
