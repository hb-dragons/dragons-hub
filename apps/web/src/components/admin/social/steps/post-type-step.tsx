"use client";

import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import type { PostType, WizardState } from "../types";

interface PostTypeStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
}

export function PostTypeStep({ state, onUpdate, onNext }: PostTypeStepProps) {
  function handlePostTypeChange(type: PostType) {
    onUpdate({ postType: type });
  }

  function handleWeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 53) {
      onUpdate({ calendarWeek: value });
    }
  }

  function handleYearChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 2000 && value <= 2100) {
      onUpdate({ year: value });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beitragstyp & Spielwoche</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Beitragstyp</Label>
          <div className="flex gap-3">
            <Button
              variant={state.postType === "preview" ? "default" : "outline"}
              onClick={() => handlePostTypeChange("preview")}
            >
              Vorschau
            </Button>
            <Button
              variant={state.postType === "results" ? "default" : "outline"}
              onClick={() => handlePostTypeChange("results")}
            >
              Ergebnisse
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-week">Kalenderwoche</Label>
            <Input
              id="calendar-week"
              type="number"
              min={1}
              max={53}
              value={state.calendarWeek}
              onChange={handleWeekChange}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Jahr</Label>
            <Input
              id="year"
              type="number"
              min={2000}
              max={2100}
              value={state.year}
              onChange={handleYearChange}
              className="w-28"
            />
          </div>
        </div>

        <Button onClick={onNext}>Spiele laden</Button>
      </CardContent>
    </Card>
  );
}
