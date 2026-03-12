import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { downloadFromGcs } from "./gcs-storage.service";
import { WeekendPreview, WeekendResults } from "@dragons/shared/social-templates";
import type { MatchRow } from "@dragons/shared/social-templates";

const SIZE = 1080;

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
