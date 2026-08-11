/**
 * Post gallery with lightbox, ported from dragons-app news/[slug].vue +
 * UiImageLightbox as a single React island (the interactive part of the news
 * detail page). Mobile shows a single column, desktop the legacy justified
 * rows; clicking an image opens the hand-rolled lightbox (Escape/arrow keys,
 * backdrop click, image counter). Blurhash placeholders arrive precomputed
 * from the build (lib/blurhash needs Node's Buffer).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { getJustifiedRows } from "../../lib/justified-rows";
import { strings } from "../../lib/strings";

export interface GalleryImage {
  src: string;
  /** Build-time blurhash BMP data URI (see BlurImage.astro). */
  placeholder: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

interface PostGalleryProps {
  images: GalleryImage[];
}

function GalleryPicture({ image, className }: { image: GalleryImage; className: string }) {
  return (
    <img
      src={image.src}
      alt={image.alt ?? ""}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading="lazy"
      decoding="async"
      className={className}
      style={
        image.placeholder != null
          ? {
              backgroundImage: `url(${image.placeholder})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    />
  );
}

export default function PostGallery({ images }: PostGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isOpen = lightboxIndex !== null;

  const justifiedRows = useMemo(() => getJustifiedRows(images), [images]);

  const showPrevious = useCallback(() => {
    setLightboxIndex((index) => (index === null ? index : index > 0 ? index - 1 : images.length - 1));
  }, [images.length]);

  const showNext = useCallback(() => {
    setLightboxIndex((index) => (index === null ? index : index < images.length - 1 ? index + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    };
    document.addEventListener("keydown", onKeydown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = "";
    };
  }, [isOpen, showPrevious, showNext]);

  const tileClasses =
    "rounded-lg shadow-md overflow-hidden border border-border transition-all duration-300 cursor-pointer";
  const openLabel = (image: GalleryImage, index: number) =>
    `${strings.news.lightboxOpen}: ${image.alt ?? `${index + 1}`}`;

  const current = lightboxIndex === null ? null : images[lightboxIndex];

  return (
    <>
      {/* Mobile: single column */}
      <div className="grid md:hidden grid-cols-1 gap-4 auto-rows-auto max-w-md mx-auto">
        {images.map((image, index) => (
          <button
            type="button"
            key={image.src}
            className={tileClasses}
            aria-label={openLabel(image, index)}
            onClick={() => setLightboxIndex(index)}
          >
            <GalleryPicture
              image={image}
              className="w-full h-auto object-cover transition-transform duration-300"
            />
          </button>
        ))}
      </div>

      {/* Desktop: justified rows */}
      <div className="hidden md:block space-y-4">
        {justifiedRows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex flex-wrap gap-4 justify-center">
            {row.map(({ image, displayWidth, displayHeight }) => {
              const index = images.indexOf(image);
              return (
                <button
                  type="button"
                  key={image.src}
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                    minWidth: "200px",
                    flexShrink: 0,
                  }}
                  className={`relative ${tileClasses} group`}
                  aria-label={openLabel(image, index)}
                  onClick={() => setLightboxIndex(index)}
                >
                  <GalleryPicture
                    image={image}
                    className="w-full h-full object-cover transition-transform duration-300 select-none group-hover:scale-105"
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {current != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
          role="dialog"
          aria-modal="true"
          aria-label={strings.news.lightboxLabel}
          onClick={(event) => {
            if (event.target === event.currentTarget) setLightboxIndex(null);
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-10 flex justify-center items-center p-2 text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10"
            aria-label={strings.news.lightboxClose}
            onClick={() => setLightboxIndex(null)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {images.length > 1 && (
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10"
              aria-label={strings.news.lightboxPrevious}
              onClick={showPrevious}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {images.length > 1 && (
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10"
              aria-label={strings.news.lightboxNext}
              onClick={showNext}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div className="max-w-[90vw] max-h-[90vh] mx-4">
            <div key={lightboxIndex} className="relative animate-in fade-in zoom-in-95 duration-75">
              <img
                src={current.src}
                alt={current.alt ?? ""}
                className="max-w-full max-h-[90vh] object-contain select-none"
              />
            </div>
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 text-white text-sm rounded-full backdrop-blur-sm">
              {lightboxIndex! + 1} / {images.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
