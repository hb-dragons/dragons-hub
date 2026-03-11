"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { Badge } from "@dragons/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import { fetchAPI } from "@/lib/api";
import type { MatchItem, WizardState } from "../types";

interface MatchReviewStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function MatchReviewStep({ state, onUpdate, onNext, onBack }: MatchReviewStepProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadMatches() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAPI<MatchItem[]>(
          `/admin/social/matches?type=${state.postType}&week=${state.calendarWeek}&year=${state.year}`,
        );
        if (!cancelled) {
          const sliced = data.slice(0, 6);
          setMatches(sliced);
          onUpdate({ matches: sliced });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fehler beim Laden der Spiele");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMatches();

    return () => {
      cancelled = true;
    };
    // Only re-fetch when the query parameters change, not when onUpdate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.postType, state.calendarWeek, state.year]);

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...matches];
    const temp = updated[index - 1]!;
    updated[index - 1] = updated[index]!;
    updated[index] = temp;
    setMatches(updated);
    onUpdate({ matches: updated });
  }

  function moveDown(index: number) {
    if (index === matches.length - 1) return;
    const updated = [...matches];
    const temp = updated[index]!;
    updated[index] = updated[index + 1]!;
    updated[index + 1] = temp;
    setMatches(updated);
    onUpdate({ matches: updated });
  }

  function removeMatch(index: number) {
    const updated = matches.filter((_, i) => i !== index);
    setMatches(updated);
    onUpdate({ matches: updated });
  }

  function formatScore(match: MatchItem): string {
    if (match.homeScore !== null && match.guestScore !== null) {
      return `${match.homeScore}:${match.guestScore}`;
    }
    return match.kickoffTime;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spiele auswählen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="animate-pulse">Spiele werden geladen…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">Keine Spiele gefunden</div>
        )}

        {!loading && !error && matches.length > 0 && (
          <ul className="space-y-2">
            {matches.map((match, index) => (
              <li
                key={match.id}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveUp(index)}
                    aria-label="Nach oben"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === matches.length - 1}
                    onClick={() => moveDown(index)}
                    aria-label="Nach unten"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{match.teamLabel}</span>
                    <span className="font-mono text-muted-foreground">{formatScore(match)}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{match.opponent}</span>
                    <Badge variant={match.isHome ? "default" : "secondary"}>
                      {match.isHome ? "Heim" : "Auswärts"}
                    </Badge>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMatch(index)}
                  aria-label="Spiel entfernen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            Zurück
          </Button>
          <Button onClick={onNext} disabled={matches.length === 0}>
            Assets auswählen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
