"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import type { PublicTeam } from "./types";
import { resolveTeamName } from "./types";

interface TeamFilterProps {
  teams: PublicTeam[];
  selectedTeamApiId: number | null;
  onSelect: (teamApiId: number | null) => void;
  allTeamsLabel: string;
}

export function TeamFilter({
  teams,
  selectedTeamApiId,
  onSelect,
  allTeamsLabel,
}: TeamFilterProps) {
  return (
    <Select
      value={selectedTeamApiId?.toString() ?? "all"}
      onValueChange={(value) => {
        onSelect(value === "all" ? null : Number(value));
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={allTeamsLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allTeamsLabel}</SelectItem>
        {teams.map((team) => (
          <SelectItem
            key={team.apiTeamPermanentId}
            value={team.apiTeamPermanentId.toString()}
          >
            {resolveTeamName(team)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
