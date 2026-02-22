"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Loader2, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { useSettings } from "./settings-provider";

export function ClubConfig() {
  const { clubConfig, setClubConfig } = useSettings();
  const [clubId, setClubId] = useState(clubConfig?.clubId?.toString() ?? "");
  const [clubName, setClubName] = useState(clubConfig?.clubName ?? "");
  const [saving, setSaving] = useState(false);

  const hasChanges =
    clubId !== (clubConfig?.clubId?.toString() ?? "") ||
    clubName !== (clubConfig?.clubName ?? "");

  async function handleSave() {
    const id = parseInt(clubId, 10);
    if (!id || id <= 0) {
      toast.error("Club ID must be a positive number");
      return;
    }
    if (!clubName.trim()) {
      toast.error("Club name is required");
      return;
    }

    try {
      setSaving(true);
      const result = await fetchAPI<{ clubId: number; clubName: string }>(
        "/admin/settings/club",
        {
          method: "PUT",
          body: JSON.stringify({ clubId: id, clubName: clubName.trim() }),
        },
      );
      setClubConfig(result);
      toast.success(`Club set to ${result.clubName}`);
    } catch {
      toast.error("Failed to save club config");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Club Configuration</CardTitle>
        <CardDescription>
          Set the club ID from basketball-bund.net. This determines which leagues can be discovered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clubConfig && !hasChanges && (
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600" />
            <span className="font-medium">{clubConfig.clubName}</span>
            <span className="text-muted-foreground">(ID: {clubConfig.clubId})</span>
          </div>
        )}

        <div className="grid max-w-sm gap-4">
          <div className="space-y-2">
            <Label htmlFor="club-id">Club ID</Label>
            <Input
              id="club-id"
              type="number"
              min={1}
              placeholder="e.g. 4121"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-name">Club Name</Label>
            <Input
              id="club-name"
              placeholder="e.g. Dragons Rhöndorf"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-fit"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
