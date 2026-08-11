import { encode } from "blurhash";
import sharp from "sharp";

// Downsample bound before encoding — blurhash only stores low-frequency DCT
// components, so anything past ~32px adds cost without changing the hash.
const MAX_INPUT_SIZE = 32;
const COMPONENTS_X = 4;
const COMPONENTS_Y = 4;

export async function encodeBlurhash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .raw()
    .ensureAlpha()
    .resize(MAX_INPUT_SIZE, MAX_INPUT_SIZE, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    COMPONENTS_X,
    COMPONENTS_Y,
  );
}
