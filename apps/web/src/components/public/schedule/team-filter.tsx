"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

interface Team {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
}

interface TeamFilterProps {
  teams: Team[];
  selectedTeamApiId: number | null;
  onSelect: (teamApiId: number | null) => void;
  allTeamsLabel: string;
}

function displayName(team: Team): string {
  return team.customName ?? team.nameShort ?? team.name;
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
            {displayName(team)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
