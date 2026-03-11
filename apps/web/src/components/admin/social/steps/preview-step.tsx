"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@dragons/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import { ImagePreview } from "../image-preview";
import type { WizardState } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface PreviewStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onBack: () => void;
}

export function PreviewStep({ state, onUpdate, onBack }: PreviewStepProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const body = {
      type: state.postType,
      calendarWeek: state.calendarWeek,
      year: state.year,
      matches: state.matches.map((m, i) => ({ matchId: m.id, order: i })),
      playerPhotoId: state.selectedPhotoId,
      backgroundId: state.selectedBackgroundId,
      playerPosition: state.playerPosition,
    };

    try {
      const res = await fetch(`${API_BASE}/admin/social/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `Fehler: HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `dragons-${state.postType}-kw${state.calendarWeek}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler beim Generieren");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vorschau</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Spielerfoto per Drag & Drop positionieren und mit den Ecken skalieren.
        </p>

        <div className="flex justify-center">
          <ImagePreview state={state} onUpdate={onUpdate} />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
            <button
              onClick={() => void handleGenerate()}
              className="ml-2 underline hover:no-underline"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={generating}>
            Zurück
          </Button>
          <Button onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird generiert…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generieren & Herunterladen
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
