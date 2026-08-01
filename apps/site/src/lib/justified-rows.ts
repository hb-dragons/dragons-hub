/**
 * Justified gallery layout, ported 1:1 from the legacy news detail page
 * (dragons-app app/pages/news/[slug].vue getJustifiedRows): rows fill a
 * 1200px container with 16px gaps; every completed row is scaled to the full
 * width, the last row keeps the target height unscaled.
 */

interface ImageDims {
  width?: number | null | undefined;
  height?: number | null | undefined;
}

export interface JustifiedImage<T> {
  image: T;
  displayWidth: number;
  displayHeight: number;
}

const CONTAINER_WIDTH = 1200;
const GAP = 16;
/** CMS media dimensions are nullable; galleries shoot 3:2 by convention. */
const FALLBACK_ASPECT_RATIO = 3 / 2;

function aspectRatio(image: ImageDims): number {
  if (image.width == null || image.height == null || image.width <= 0 || image.height <= 0) {
    return FALLBACK_ASPECT_RATIO;
  }
  return image.width / image.height;
}

export function getJustifiedRows<T extends ImageDims>(
  images: readonly T[],
  targetRowHeight = 250,
): JustifiedImage<T>[][] {
  const rows: JustifiedImage<T>[][] = [];
  let currentRow: T[] = [];
  let currentRowWidth = 0;

  for (const image of images) {
    const imageWidth = targetRowHeight * aspectRatio(image);

    if (currentRow.length > 0 && currentRowWidth + imageWidth + GAP > CONTAINER_WIDTH) {
      const totalGapWidth = (currentRow.length - 1) * GAP;
      const scaleFactor = (CONTAINER_WIDTH - totalGapWidth) / currentRowWidth;
      rows.push(
        currentRow.map((img) => ({
          image: img,
          displayWidth: targetRowHeight * aspectRatio(img) * scaleFactor,
          displayHeight: targetRowHeight * scaleFactor,
        })),
      );
      currentRow = [image];
      currentRowWidth = imageWidth;
    } else {
      currentRow.push(image);
      currentRowWidth += imageWidth + (currentRow.length > 1 ? GAP : 0);
    }
  }

  if (currentRow.length > 0) {
    rows.push(
      currentRow.map((img) => ({
        image: img,
        displayWidth: targetRowHeight * aspectRatio(img),
        displayHeight: targetRowHeight,
      })),
    );
  }

  return rows;
}
