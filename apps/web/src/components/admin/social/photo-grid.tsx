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
      {/* Loading skeleton */}
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
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

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
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
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
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteEndpoint, onDelete]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <div
              key={item.id}
              className="group relative"
              style={{ aspectRatio }}
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={[
                  "absolute inset-0 overflow-hidden rounded-md border bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              </button>

              {/* Delete button — sibling to select button for valid HTML */}
              <button
                type="button"
                aria-label={`${item.originalName} löschen`}
                className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-red-400 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/90 hover:text-red-300"
                onClick={() => setDeleteTarget(item)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
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
              &bdquo;{deleteTarget?.originalName}&rdquo; wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
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
