import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { downloadFromGcs } from "./gcs-storage.service";
import { WeekendPreview, WeekendResults } from "@dragons/shared/social-templates";
import type { MatchRow } from "@dragons/shared/social-templates";

const SIZE = 1080;
// Cap the composited player surface. The longest edge of a stored photo is
// SIZE px (player-photo.service normalizes on upload) and scale maxes at 5, so
// SIZE * 5 never shrinks a legitimate image — it only bounds legacy
// full-resolution uploads, keeping the sharp surface from triggering an OOM.
const MAX_PLAYER_DIMENSION = SIZE * 5;

// Font cache — loaded from GCS on first use, guarded against concurrent requests
// Uses static font files because Satori's opentype.js cannot parse variable font fvar tables.
interface FontData {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
  extraBold: ArrayBuffer;
  greaterTheory: ArrayBuffer;
}
let fontPromise: Promise<FontData> | null = null;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function loadFonts() {
  if (!fontPromise) {
    fontPromise = (async () => {
      const [regularBuf, boldBuf, extraBoldBuf, gtBuf] = await Promise.all([
        downloadFromGcs("assets/fonts/LeagueSpartan-Regular.ttf"),
        downloadFromGcs("assets/fonts/LeagueSpartan-Bold.ttf"),
        downloadFromGcs("assets/fonts/LeagueSpartan-ExtraBold.ttf"),
        downloadFromGcs("assets/fonts/greatertheory.otf"),
      ]);
      return {
        regular: toArrayBuffer(regularBuf),
        bold: toArrayBuffer(boldBuf),
        extraBold: toArrayBuffer(extraBoldBuf),
        greaterTheory: toArrayBuffer(gtBuf),
      };
    })();
    // Don't cache a rejection: one transient GCS error would otherwise poison
    // all future generations until restart. Clear the cache so the next call retries.
    fontPromise.catch(() => {
      fontPromise = null;
    });
  }
  return fontPromise;
}

export interface GenerateParams {
  type: "preview" | "results";
  calendarWeek: number;
  matches: MatchRow[];
  footer: string;
  backgroundFilename: string;
  playerPhotoFilename: string;
  playerPosition: { x: number; y: number; scale: number };
}

export async function generatePostImage(params: GenerateParams): Promise<Buffer> {
  const fonts = await loadFonts();

  const { type, calendarWeek, matches, footer, backgroundFilename, playerPhotoFilename, playerPosition } = params;

  // 1. Render text via Satori → SVG
  const element =
    type === "preview"
      ? WeekendPreview({ calendarWeek, matches, footer })
      : WeekendResults({ calendarWeek, matches, footer });

  const svg = await satori(element, {
    width: SIZE,
    height: SIZE,
    fonts: [
      { name: "League Spartan", data: fonts.regular, weight: 400, style: "normal" },
      { name: "League Spartan", data: fonts.bold, weight: 700, style: "normal" },
      { name: "League Spartan", data: fonts.extraBold, weight: 800, style: "normal" },
      { name: "Greater Theory", data: fonts.greaterTheory, weight: 900, style: "normal" },
    ],
  });

  // 2. SVG → PNG via resvg
  const textLayerPng = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng();

  // 3. Fetch images from GCS
  const [bgBuffer, playerBuffer] = await Promise.all([
    downloadFromGcs(`backgrounds/${backgroundFilename}`),
    downloadFromGcs(`player-photos/${playerPhotoFilename}`),
  ]);

  // 4. Scale player photo
  const meta = await sharp(playerBuffer).metadata();
  let w = Math.round((meta.width ?? 500) * playerPosition.scale);
  let h = Math.round((meta.height ?? 750) * playerPosition.scale);
  // Clamp the longest edge so a large source at high scale can't force a huge
  // sharp surface (memory spike / OOM). Preserve aspect ratio.
  const longest = Math.max(w, h);
  if (longest > MAX_PLAYER_DIMENSION) {
    const factor = MAX_PLAYER_DIMENSION / longest;
    w = Math.round(w * factor);
    h = Math.round(h * factor);
  }
  const resizedPlayer = await sharp(playerBuffer).resize(w, h).ensureAlpha().png().toBuffer();

  // 5. Composite: background → player → text
  return sharp(bgBuffer)
    .composite([
      { input: resizedPlayer, left: Math.round(playerPosition.x), top: Math.round(playerPosition.y) },
      { input: Buffer.from(textLayerPng), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}
