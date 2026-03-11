"use client";

import { useRef, useState } from "react";
import { Plus, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface PhotoGridProps<T extends { id: number; filename: string; originalName: string }> {
  items: T[];
  selectedId: number | null;
  onSelect: (item: T) => void;
  uploadEndpoint: string;
  imageEndpoint: string;
  onUploadComplete: () => void;
  label: string;
}

export function PhotoGrid<T extends { id: number; filename: string; originalName: string }>({
  items,
  selectedId,
  onSelect,
  uploadEndpoint,
  imageEndpoint,
  onUploadComplete,
  label,
}: PhotoGridProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
        // Do NOT set Content-Type — let the browser set the multipart boundary
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
      // Reset so the same file can be re-uploaded if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

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
              className={[
                "relative aspect-square overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected ? "ring-2 ring-primary" : "hover:opacity-90",
              ].join(" ")}
              aria-label={item.originalName}
              aria-pressed={isSelected}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_BASE}${imageEndpoint}/${item.id}/image`}
                alt={item.originalName}
                className="h-full w-full object-cover"
                crossOrigin="use-credentials"
              />
            </button>
          );
        })}

        {/* Upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
