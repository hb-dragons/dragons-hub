"use client";

import { useState } from "react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
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
}

export function TeamsTable({ initialTeams }: { initialTeams: OwnClubTeam[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  function getDraft(team: OwnClubTeam) {
    return drafts[team.id] ?? team.customName ?? "";
  }

  function isDirty(team: OwnClubTeam) {
    const draft = getDraft(team);
    return draft !== (team.customName ?? "");
  }

  async function save(team: OwnClubTeam) {
    const draft = getDraft(team);
    const customName = draft.trim() === "" ? null : draft.trim();

    setSaving((prev) => ({ ...prev, [team.id]: true }));
    try {
      const updated = await fetchAPI<OwnClubTeam>(`/admin/teams/${team.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customName }),
      });
      setTeams((prev) => prev.map((t) => (t.id === team.id ? updated : t)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
    } catch {
      // Error is surfaced by fetchAPI; keep draft for retry
    } finally {
      setSaving((prev) => ({ ...prev, [team.id]: false }));
    }
  }

  if (teams.length === 0) {
    return <p className="text-muted-foreground">No own-club teams found.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>API Name</TableHead>
          <TableHead>League</TableHead>
          <TableHead>Custom Name</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.map((team) => (
          <TableRow key={team.id}>
            <TableCell className="font-medium">{team.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {team.leagueName ?? "—"}
            </TableCell>
            <TableCell>
              <Input
                value={getDraft(team)}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [team.id]: e.target.value }))
                }
                placeholder="Enter custom name…"
                maxLength={50}
                className="max-w-xs"
              />
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                disabled={!isDirty(team) || saving[team.id]}
                onClick={() => save(team)}
              >
                {saving[team.id] ? "Saving…" : "Save"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
