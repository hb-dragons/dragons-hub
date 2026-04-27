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
import { GripVertical } from "lucide-react";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
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

interface OwnClubTeam {
  id: number;
  name: string;
  customName: string | null;
  leagueName: string | null;
  estimatedGameDuration: number | null;
  badgeColor: string | null;
  displayOrder: number;
}

interface TeamRowProps {
  team: OwnClubTeam;
  canManage: boolean;
  reorderMode: boolean;
  draft: string;
  durationDraft: string;
  colorDraft: string | null | undefined;
  saving: boolean;
  isDirty: boolean;
  onDraftChange: (id: number, value: string) => void;
  onDurationChange: (id: number, value: string) => void;
  onColorChange: (id: number, value: string) => void;
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
    saving,
    isDirty,
    onDraftChange,
    onDurationChange,
    onColorChange,
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
      <TableCell className="text-muted-foreground">
        {team.leagueName ?? "—"}
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
  const { data: teams } = useSWR<OwnClubTeam[]>(SWR_KEYS.teams, apiFetcher);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<number, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
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

  function isDirty(team: OwnClubTeam) {
    const nameDraft = getDraft(team);
    const durDraft = getDurationDraft(team);
    const colorDraft = getColorDraft(team);
    return (
      nameDraft !== (team.customName ?? "") ||
      durDraft !== (team.estimatedGameDuration?.toString() ?? "") ||
      colorDraft !== team.badgeColor
    );
  }

  async function save(team: OwnClubTeam) {
    const draft = getDraft(team);
    const customName = draft.trim() === "" ? null : draft.trim();
    const durDraft = getDurationDraft(team);
    const estimatedGameDuration =
      durDraft.trim() === "" ? null : parseInt(durDraft.trim(), 10);
    const badgeColor = getColorDraft(team);

    setSaving((prev) => ({ ...prev, [team.id]: true }));
    try {
      const updated = await fetchAPI<OwnClubTeam>(`/admin/teams/${team.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customName, estimatedGameDuration, badgeColor }),
      });
      await mutate(
        SWR_KEYS.teams,
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
    } catch {
      // surfaced by fetchAPI; keep draft for retry
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

    await mutate(SWR_KEYS.teams, reordered, { revalidate: false });

    try {
      await fetchAPI<Array<{ id: number; name: string; displayOrder: number }>>(
        `/admin/teams/order`,
        {
          method: "PUT",
          body: JSON.stringify({ teamIds: reordered.map((t) => t.id) }),
        },
      );
      await mutate(SWR_KEYS.teams);
    } catch {
      await mutate(SWR_KEYS.teams);
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
    saving: saving[team.id] ?? false,
    isDirty: isDirty(team),
    onDraftChange: (id: number, value: string) =>
      setDrafts((prev) => ({ ...prev, [id]: value })),
    onDurationChange: (id: number, value: string) =>
      setDurationDrafts((prev) => ({ ...prev, [id]: value })),
    onColorChange: (id: number, value: string) =>
      setColorDrafts((prev) => ({ ...prev, [id]: value })),
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
        <TableHead className="w-24" />
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
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
          onDragEnd={handleDragEnd}
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
