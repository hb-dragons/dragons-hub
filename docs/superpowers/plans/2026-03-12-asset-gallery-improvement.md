# Asset Gallery Improvement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the social media asset gallery with contained images, per-grid aspect ratios, blur-up loading animations, and hover-to-delete with confirmation dialog.

**Architecture:** Rewrite the `PhotoGrid` component to support configurable aspect ratios, `object-contain` image display, per-image loading state with blur-up fade-in, and a hover-revealed delete button with `AlertDialog` confirmation. Update `AssetSelectStep` to pass the new props and handle deletion callbacks. No backend changes needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Radix AlertDialog (`@dragons/ui`), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-12-asset-gallery-improvement-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/admin/social/photo-grid.tsx` | Rewrite | Image grid with configurable aspect ratio, contained images, blur-up loading, hover delete with confirmation |
| `apps/web/src/components/admin/social/steps/asset-select-step.tsx` | Modify | Pass new props to PhotoGrid, handle deletion callbacks |

---

## Chunk 1: PhotoGrid Rewrite + AssetSelectStep Updates

### Task 1: Rewrite PhotoGrid with all improvements

**Files:**
- Rewrite: `apps/web/src/components/admin/social/photo-grid.tsx`

- [ ] **Step 1: Rewrite PhotoGrid with configurable aspect ratio, contained images, blur-up loading, and hover delete**

Replace the entire content of `photo-grid.tsx` with:

```tsx
"use client";

import { useRef, useState, useCallback } from "react";
import { Plus, Loader2, X, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface PhotoGridProps<T extends { id: number; filename: string; originalName: string }> {
  items: T[];
  selectedId: number | null;
  onSelect: (item: T) => void;
  uploadEndpoint: string;
  imageEndpoint: string;
  deleteEndpoint: string;
  onUploadComplete: () => void;
  onDelete: (item: T) => void;
  label: string;
  /** CSS aspect-ratio value, e.g. "3/4" or "1/1" */
  aspectRatio: string;
}

function GridImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full w-full">
      {/* Blur placeholder */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={[
          "h-full w-full object-contain transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
        ].join(" ")}
        crossOrigin="use-credentials"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export function PhotoGrid<T extends { id: number; filename: string; originalName: string }>({
  items,
  selectedId,
  onSelect,
  uploadEndpoint,
  imageEndpoint,
  deleteEndpoint,
  onUploadComplete,
  onDelete,
  label,
  aspectRatio,
}: PhotoGridProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}${uploadEndpoint}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? res.statusText);
      }

      onUploadComplete();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}${deleteEndpoint}/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? res.statusText);
      }
      onDelete(deleteTarget);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteEndpoint, onDelete]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {uploadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              style={{ aspectRatio }}
              className={[
                "group relative overflow-hidden rounded-md border bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected ? "ring-2 ring-primary" : "hover:border-muted-foreground/40",
              ].join(" ")}
              aria-label={item.originalName}
              aria-pressed={isSelected}
            >
              <GridImage
                src={`${API_BASE}${imageEndpoint}/${item.id}/image`}
                alt={item.originalName}
              />

              {/* Selection badge */}
              {isSelected && (
                <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              {/* Hover delete button */}
              <span
                role="button"
                tabIndex={0}
                aria-label={`${item.originalName} löschen`}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-red-400 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/90 hover:text-red-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    setDeleteTarget(item);
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}

        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ aspectRatio }}
          className="flex items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Bild hochladen"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bild löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              &bdquo;{deleteTarget?.originalName}&ldquo; wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors in the new PhotoGrid**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/photo-grid.tsx
git commit -m "feat(social): rewrite PhotoGrid with contained images, blur-up loading, and hover delete"
```

---

### Task 2: Update AssetSelectStep to pass new props and handle deletion

**Files:**
- Modify: `apps/web/src/components/admin/social/steps/asset-select-step.tsx`

- [ ] **Step 1: Update AssetSelectStep to pass aspectRatio, deleteEndpoint, and onDelete to each PhotoGrid**

In `asset-select-step.tsx`, make these changes:

1. Add `handleDeletePhoto` and `handleDeleteBackground` functions that remove the item from local state and clear the selection if the deleted item was selected.

2. Pass `aspectRatio`, `deleteEndpoint`, and `onDelete` to each `PhotoGrid`.

The updated file should look like:

```tsx
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

  function handleDeletePhoto(photo: PlayerPhoto) {
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (state.selectedPhotoId === photo.id) {
      onUpdate({ selectedPhotoId: null, selectedPhoto: null });
    }
  }

  function handleDeleteBackground(bg: Background) {
    setBackgrounds((prev) => prev.filter((b) => b.id !== bg.id));
    if (state.selectedBackgroundId === bg.id) {
      onUpdate({ selectedBackgroundId: null, selectedBackground: null });
    }
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
            onDelete={handleDeletePhoto}
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
            onDelete={handleDeleteBackground}
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
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/social/steps/asset-select-step.tsx
git commit -m "feat(social): update AssetSelectStep with aspect ratios and delete support"
```

---

### Task 3: Verify full build and manual test

- [ ] **Step 1: Run full typecheck across the monorepo**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run existing tests**

Run: `pnpm test`
Expected: All existing tests pass

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS
