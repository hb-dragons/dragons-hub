"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, TriangleAlert } from "lucide-react";
import { SWR_KEYS } from "@/lib/swr-keys";
import { queries } from "@/lib/swr-queries";
import { api } from "@/lib/api";
import { SeasonContextSelect } from "@/components/admin/seasons/season-context-select";
import { TeamStaffDialog } from "./team-staff-dialog";
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
import type { OwnClubTeam } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

interface TeamRowProps {
  team: OwnClubTeam;
  canManage: boolean;
  reorderMode: boolean;
  draft: string;
  durationDraft: string;
  colorDraft: string | null | undefined;
  leagueDraft: number | null;
  trackedLeagues: { id: number; name: string }[];
  saving: boolean;
  isDirty: boolean;
  onDraftChange: (id: number, value: string) => void;
  onDurationChange: (id: number, value: string) => void;
  onColorChange: (id: number, value: string) => void;
  onLeagueChange: (id: number, value: number | null) => void;
  onSave: (team: OwnClubTeam) => void;
}

function StaticTeamRow(props: TeamRowProps) {
  return <TeamRowContent {...props} />;
}

function SortableTeamRow(props: TeamRowProps) {
  const { team, canManage } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TeamRowContent
      {...props}
      rowRef={setNodeRef}
      rowStyle={style}
      dragAttributes={attributes}
      dragListeners={listeners}
    />
  );
}

interface TeamRowContentExtras {
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: React.CSSProperties;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}

function TeamRowContent(props: TeamRowProps & TeamRowContentExtras) {
  const {
    team,
    canManage,
    reorderMode,
    draft,
    durationDraft,
    colorDraft,
    leagueDraft,
    trackedLeagues,
    saving,
    isDirty,
    onDraftChange,
    onDurationChange,
    onColorChange,
    onLeagueChange,
    onSave,
    rowRef,
    rowStyle,
    dragAttributes,
    dragListeners,
  } = props;
  const t = useTranslations();
  const interactiveDisabled = !canManage || reorderMode;

  return (
    <TableRow ref={rowRef} style={rowStyle}>
      {reorderMode ? (
        <TableCell className="w-10">
          {canManage ? (
            <button
              type="button"
              className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("teams.dragHandle")}
              {...dragAttributes}
              {...dragListeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
        </TableCell>
      ) : null}
      <TableCell className="font-medium">{team.name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select
            value={leagueDraft === null ? "none" : String(leagueDraft)}
            onValueChange={(v) => onLeagueChange(team.id, v === "none" ? null : Number(v))}
            disabled={interactiveDisabled}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t("teams.leagueNotConnected")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("teams.leagueNotConnected")}</SelectItem>
              {trackedLeagues.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
              ))}
              {/* An untracked-but-connected league must stay selectable-as-current */}
              {team.leagueId !== null && !team.leagueTracked ? (
                <SelectItem value={String(team.leagueId)}>{team.leagueName}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {!team.leagueTracked ? (
            <span className="flex items-center gap-1 text-xs text-destructive" title={t("teams.leagueUntracked")}>
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              {t("teams.leagueUntracked")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={draft}
          onChange={(e) => onDraftChange(team.id, e.target.value)}
          placeholder={t("teams.placeholder")}
          maxLength={50}
          disabled={interactiveDisabled}
          className="max-w-xs"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          value={durationDraft}
          onChange={(e) => onDurationChange(team.id, e.target.value)}
          placeholder={t("teams.gameDurationPlaceholder")}
          disabled={interactiveDisabled}
          className="max-w-[100px]"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {COLOR_PRESET_KEYS.map((colorKey) => {
            const preset = getColorPreset(colorKey);
            const isSelected = colorDraft === colorKey;
            return (
              <button
                key={colorKey}
                type="button"
                disabled={interactiveDisabled}
                style={{ backgroundColor: preset.dot }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  isSelected
                    ? "scale-110 border-foreground ring-2 ring-foreground/20"
                    : "border-transparent",
                  !interactiveDisabled
                    ? "hover:scale-105"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={() => onColorChange(team.id, colorKey)}
                aria-label={colorKey}
              />
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        {/* Staff editing is a dialog of its own, so it stays available while a
            row's inline drafts are dirty, but not while rows are being dragged. */}
        {reorderMode ? null : (
          <TeamStaffDialog
            entryId={team.id}
            teamName={team.customName ?? team.name}
            canManage={canManage}
          />
        )}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          disabled={interactiveDisabled || !isDirty || saving}
          onClick={() => onSave(team)}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface TeamsTableProps {
  canManage: boolean;
}

export function TeamsTable({ canManage }: TeamsTableProps) {
  const t = useTranslations();
  const [seasonId, setSeasonId] = useState<number | undefined>(undefined);
  const teamsQ = queries.teams(seasonId);
  const { data: teams } = useSWR(teamsQ.key, teamsQ.fetcher);
  const seasonsQ = queries.seasons();
  const { data: seasons } = useSWR(seasonsQ.key, seasonsQ.fetcher);
  const resolvedSeasonId = seasonId ?? seasons?.find((s) => s.status === "active")?.id;
  const leaguesQ = resolvedSeasonId !== undefined ? queries.seasonLeagues(resolvedSeasonId) : null;
  const { data: trackedLeagues } = useSWR(leaguesQ?.key ?? null, leaguesQ?.fetcher ?? null);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<number, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
  const [leagueDrafts, setLeagueDrafts] = useState<Record<number, number | null>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [reorderMode, setReorderMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function getDraft(team: OwnClubTeam) {
    return drafts[team.id] ?? team.customName ?? "";
  }

  function getDurationDraft(team: OwnClubTeam) {
    return durationDrafts[team.id] ?? team.estimatedGameDuration?.toString() ?? "";
  }

  function getColorDraft(team: OwnClubTeam) {
    return team.id in colorDrafts ? colorDrafts[team.id] : team.badgeColor;
  }

  function getLeagueDraft(team: OwnClubTeam): number | null {
    return team.id in leagueDrafts ? (leagueDrafts[team.id] ?? null) : team.leagueId;
  }

  function isDirty(team: OwnClubTeam) {
    const nameDraft = getDraft(team);
    const durDraft = getDurationDraft(team);
    const colorDraft = getColorDraft(team);
    const leagueDraft = getLeagueDraft(team);
    return (
      nameDraft !== (team.customName ?? "") ||
      durDraft !== (team.estimatedGameDuration?.toString() ?? "") ||
      colorDraft !== team.badgeColor ||
      leagueDraft !== team.leagueId
    );
  }

  async function save(team: OwnClubTeam) {
    const draft = getDraft(team);
    const customName = draft.trim() === "" ? null : draft.trim();
    const durDraft = getDurationDraft(team);
    const estimatedGameDuration =
      durDraft.trim() === "" ? null : parseInt(durDraft.trim(), 10);
    const badgeColor = getColorDraft(team);
    const leagueDraft = getLeagueDraft(team);
    // Only send leagueId when it actually changed: the API treats any
    // defined leagueId as a league write and flips link_source to "manual",
    // so sending the unchanged value on a name/color/duration-only save would
    // wrongly mark a federation-seeded link as manually set.
    const leagueId = leagueDraft !== team.leagueId ? leagueDraft : undefined;

    setSaving((prev) => ({ ...prev, [team.id]: true }));
    try {
      const updated = await api.teams.update(team.id, {
        customName,
        estimatedGameDuration,
        badgeColor,
        ...(leagueId !== undefined ? { leagueId } : {}),
      });
      await mutate(
        SWR_KEYS.teams(seasonId),
        (current: OwnClubTeam[] | undefined) =>
          (current ?? []).map((t) => (t.id === team.id ? updated : t)),
        { revalidate: false },
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setDurationDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setColorDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
      setLeagueDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
    } catch {
      // error surfaced upstream; keep draft for retry
    } finally {
      setSaving((prev) => ({ ...prev, [team.id]: false }));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!canManage) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = teamsList.findIndex((t) => t.id === active.id);
    const newIndex = teamsList.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(teamsList, oldIndex, newIndex);

    await mutate(SWR_KEYS.teams(seasonId), reordered, { revalidate: false });

    try {
      await api.teams.reorder({ seasonId, entryIds: reordered.map((t) => t.id) });
      await mutate(SWR_KEYS.teams(seasonId));
    } catch {
      await mutate(SWR_KEYS.teams(seasonId));
    }
  }

  if (teamsList.length === 0) {
    return <p className="text-muted-foreground">{t("teams.empty")}</p>;
  }

  const rowProps = teamsList.map((team) => ({
    team,
    canManage,
    reorderMode,
    draft: getDraft(team),
    durationDraft: getDurationDraft(team),
    colorDraft: getColorDraft(team),
    leagueDraft: getLeagueDraft(team),
    trackedLeagues: trackedLeagues?.leagues ?? [],
    saving: saving[team.id] ?? false,
    isDirty: isDirty(team),
    onDraftChange: (id: number, value: string) =>
      setDrafts((prev) => ({ ...prev, [id]: value })),
    onDurationChange: (id: number, value: string) =>
      setDurationDrafts((prev) => ({ ...prev, [id]: value })),
    onColorChange: (id: number, value: string) =>
      setColorDrafts((prev) => ({ ...prev, [id]: value })),
    onLeagueChange: (id: number, value: number | null) =>
      setLeagueDrafts((prev) => ({ ...prev, [id]: value })),
    onSave: save,
  }));

  const tableHeader = (
    <TableHeader>
      <TableRow>
        {reorderMode ? <TableHead className="w-10" /> : null}
        <TableHead>{t("teams.columns.apiName")}</TableHead>
        <TableHead>{t("teams.columns.league")}</TableHead>
        <TableHead>{t("teams.columns.customName")}</TableHead>
        <TableHead>{t("teams.gameDuration")}</TableHead>
        <TableHead>{t("teams.badgeColor")}</TableHead>
        <TableHead>{t("teams.staff.column")}</TableHead>
        <TableHead className="w-24" />
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <SeasonContextSelect value={seasonId} onChange={setSeasonId} />
        <Button
          type="button"
          size="sm"
          variant={reorderMode ? "default" : "outline"}
          disabled={!canManage}
          onClick={() => setReorderMode((v) => !v)}
        >
          {reorderMode ? t("teams.reorderDone") : t("teams.reorder")}
        </Button>
      </div>

      {reorderMode ? (
        <DndContext
          id="teams-reorder"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => { void handleDragEnd(event); }}
        >
          <Table>
            {tableHeader}
            <TableBody>
              <SortableContext
                items={teamsList.map((team) => team.id)}
                strategy={verticalListSortingStrategy}
              >
                {rowProps.map((p) => (
                  <SortableTeamRow key={p.team.id} {...p} />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      ) : (
        <Table>
          {tableHeader}
          <TableBody>
            {rowProps.map((p) => (
              <StaticTeamRow key={p.team.id} {...p} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
