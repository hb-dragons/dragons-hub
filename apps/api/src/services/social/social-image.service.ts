import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { downloadFromGcs } from "./gcs-storage.service";
import { WeekendPreview } from "./templates/weekend-preview";
import { WeekendResults } from "./templates/weekend-results";
import type { MatchRow } from "./templates/shared";

const SIZE = 1080;

// Font cache — loaded from GCS on first use, guarded against concurrent requests
let fontPromise: Promise<{ leagueSpartan: ArrayBuffer; greaterTheory: ArrayBuffer }> | null = null;

async function loadFonts() {
  if (!fontPromise) {
    fontPromise = (async () => {
      const [lsBuf, gtBuf] = await Promise.all([
        downloadFromGcs("assets/fonts/LeagueSpartan-VariableFont_wght.ttf"),
        downloadFromGcs("assets/fonts/greatertheory.otf"),
      ]);
      return {
        leagueSpartan: lsBuf.buffer.slice(lsBuf.byteOffset, lsBuf.byteOffset + lsBuf.byteLength) as ArrayBuffer,
        greaterTheory: gtBuf.buffer.slice(gtBuf.byteOffset, gtBuf.byteOffset + gtBuf.byteLength) as ArrayBuffer,
      };
    })();
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
      { name: "League Spartan", data: fonts.leagueSpartan, weight: 400, style: "normal" },
      { name: "League Spartan", data: fonts.leagueSpartan, weight: 700, style: "normal" },
      { name: "League Spartan", data: fonts.leagueSpartan, weight: 800, style: "normal" },
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
  const w = Math.round((meta.width ?? 500) * playerPosition.scale);
  const h = Math.round((meta.height ?? 750) * playerPosition.scale);
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
