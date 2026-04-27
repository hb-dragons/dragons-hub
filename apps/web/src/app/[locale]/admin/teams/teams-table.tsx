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
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { can, COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
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

interface SortableTeamRowProps {
  team: OwnClubTeam;
  canManage: boolean;
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

function SortableTeamRow(props: SortableTeamRowProps) {
  const { team, canManage } = props;
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10">
        {canManage ? (
          <button
            type="button"
            className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
            aria-label={t("teams.dragHandle")}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
      </TableCell>
      <TableCell className="font-medium">{team.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {team.leagueName ?? "—"}
      </TableCell>
      <TableCell>
        <Input
          value={props.draft}
          onChange={(e) => props.onDraftChange(team.id, e.target.value)}
          placeholder={t("teams.placeholder")}
          maxLength={50}
          disabled={!canManage}
          className="max-w-xs"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          value={props.durationDraft}
          onChange={(e) => props.onDurationChange(team.id, e.target.value)}
          placeholder={t("teams.gameDurationPlaceholder")}
          disabled={!canManage}
          className="max-w-[100px]"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {COLOR_PRESET_KEYS.map((colorKey) => {
            const preset = getColorPreset(colorKey);
            const isSelected = props.colorDraft === colorKey;
            return (
              <button
                key={colorKey}
                type="button"
                disabled={!canManage}
                style={{ backgroundColor: preset.dot }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  isSelected
                    ? "scale-110 border-foreground ring-2 ring-foreground/20"
                    : "border-transparent",
                  canManage ? "hover:scale-105" : "cursor-not-allowed opacity-50",
                )}
                onClick={() => props.onColorChange(team.id, colorKey)}
                aria-label={colorKey}
              />
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        {canManage && (
          <Button
            size="sm"
            disabled={!props.isDirty || props.saving}
            onClick={() => props.onSave(team)}
          >
            {props.saving ? t("common.saving") : t("common.save")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function TeamsTable() {
  const t = useTranslations();
  const { data: session } = authClient.useSession();
  const canManage = can(session?.user ?? null, "team", "manage");
  const { data: teams } = useSWR<OwnClubTeam[]>(SWR_KEYS.teams, apiFetcher);
  const { mutate } = useSWRConfig();
  const teamsList = teams ?? [];
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<number, string>>({});
  const [colorDrafts, setColorDrafts] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

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
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = teamsList.findIndex((t) => t.id === active.id);
    const newIndex = teamsList.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(teamsList, oldIndex, newIndex);

    // Optimistic SWR update
    await mutate(SWR_KEYS.teams, reordered, { revalidate: false });

    try {
      await fetchAPI<Array<{ id: number; name: string; displayOrder: number }>>(
        `/admin/teams/order`,
        {
          method: "PUT",
          body: JSON.stringify({ teamIds: reordered.map((t) => t.id) }),
        },
      );
      // Revalidate to pick up server-truth displayOrder values
      await mutate(SWR_KEYS.teams);
    } catch {
      // Rollback on failure (fetchAPI surfaces toast)
      await mutate(SWR_KEYS.teams);
    }
  }

  if (teamsList.length === 0) {
    return <p className="text-muted-foreground">{t("teams.empty")}</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>{t("teams.columns.apiName")}</TableHead>
            <TableHead>{t("teams.columns.league")}</TableHead>
            <TableHead>{t("teams.columns.customName")}</TableHead>
            <TableHead>{t("teams.gameDuration")}</TableHead>
            <TableHead>{t("teams.badgeColor")}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext
            items={teamsList.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {teamsList.map((team) => (
              <SortableTeamRow
                key={team.id}
                team={team}
                canManage={canManage}
                draft={getDraft(team)}
                durationDraft={getDurationDraft(team)}
                colorDraft={getColorDraft(team)}
                saving={saving[team.id] ?? false}
                isDirty={isDirty(team)}
                onDraftChange={(id, value) =>
                  setDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onDurationChange={(id, value) =>
                  setDurationDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onColorChange={(id, value) =>
                  setColorDrafts((prev) => ({ ...prev, [id]: value }))
                }
                onSave={save}
              />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}
