"use client";

import { useEffect, useState } from "react";
import { Button } from "@dragons/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@dragons/ui/components/card";
import { fetchAPI } from "@/lib/api";
import { PhotoGrid } from "../photo-grid";
import type { Background, PlayerPhoto, WizardState } from "../types";

interface AssetSelectStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AssetSelectStep({ state, onUpdate, onNext, onBack }: AssetSelectStepProps) {
  const [photos, setPhotos] = useState<PlayerPhoto[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [loadingBackgrounds, setLoadingBackgrounds] = useState(true);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  async function loadPhotos() {
    setLoadingPhotos(true);
    setPhotoError(null);
    try {
      const data = await fetchAPI<PlayerPhoto[]>("/admin/social/player-photos");
      setPhotos(data);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Fehler beim Laden der Fotos");
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function loadBackgrounds() {
    setLoadingBackgrounds(true);
    setBackgroundError(null);
    try {
      const data = await fetchAPI<Background[]>("/admin/social/backgrounds");
      setBackgrounds(data);
      // Auto-select the default background if none is selected yet
      if (state.selectedBackgroundId === null) {
        const defaultBg = data.find((bg) => bg.isDefault);
        if (defaultBg) {
          onUpdate({ selectedBackgroundId: defaultBg.id, selectedBackground: defaultBg });
        }
      }
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : "Fehler beim Laden der Hintergründe");
    } finally {
      setLoadingBackgrounds(false);
    }
  }

  useEffect(() => {
    void loadPhotos();
  }, []);

  useEffect(() => {
    void loadBackgrounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectPhoto(photo: PlayerPhoto) {
    onUpdate({ selectedPhotoId: photo.id, selectedPhoto: photo });
  }

  function handleSelectBackground(bg: Background) {
    onUpdate({ selectedBackgroundId: bg.id, selectedBackground: bg });
  }

  const canProceed =
    state.selectedPhotoId !== null && state.selectedBackgroundId !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assets auswählen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadingPhotos ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <span className="animate-pulse">Fotos werden geladen…</span>
          </div>
        ) : photoError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {photoError}
          </div>
        ) : (
          <PhotoGrid
            items={photos}
            selectedId={state.selectedPhotoId}
            onSelect={handleSelectPhoto}
            uploadEndpoint="/admin/social/player-photos"
            imageEndpoint="/admin/social/player-photos"
            deleteEndpoint="/admin/social/player-photos"
            onUploadComplete={() => void loadPhotos()}
            onDelete={(photo) => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
            label="Spielerfoto"
            aspectRatio="3/4"
          />
        )}

        {loadingBackgrounds ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <span className="animate-pulse">Hintergründe werden geladen…</span>
          </div>
        ) : backgroundError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {backgroundError}
          </div>
        ) : (
          <PhotoGrid
            items={backgrounds}
            selectedId={state.selectedBackgroundId}
            onSelect={handleSelectBackground}
            uploadEndpoint="/admin/social/backgrounds"
            imageEndpoint="/admin/social/backgrounds"
            deleteEndpoint="/admin/social/backgrounds"
            onUploadComplete={() => void loadBackgrounds()}
            onDelete={(bg) => setBackgrounds((prev) => prev.filter((b) => b.id !== bg.id))}
            label="Hintergrund"
            aspectRatio="1/1"
          />
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            Zurück
          </Button>
          <Button onClick={onNext} disabled={!canProceed}>
            Vorschau
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
