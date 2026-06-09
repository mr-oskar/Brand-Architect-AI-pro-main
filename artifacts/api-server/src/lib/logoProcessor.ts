import sharp from "sharp";

export interface LogoVariants {
  original: string;
  black: string;
  white: string;
  grayscale: string;
}

/**
 * Generate logo variants from a base64 data URL or Buffer.
 * Returns { black, white, grayscale } as PNG Buffers.
 */
export async function generateLogoVariants(
  inputBuffer: Buffer
): Promise<{ black: Buffer; white: Buffer; grayscale: Buffer }> {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const total = width * height * 4;

  const blackPx = Buffer.alloc(total);
  const whitePx = Buffer.alloc(total);
  const grayPx = Buffer.alloc(total);

  for (let i = 0; i < total; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    blackPx[i] = 0;
    blackPx[i + 1] = 0;
    blackPx[i + 2] = 0;
    blackPx[i + 3] = a;

    whitePx[i] = 255;
    whitePx[i + 1] = 255;
    whitePx[i + 2] = 255;
    whitePx[i + 3] = a;

    grayPx[i] = gray;
    grayPx[i + 1] = gray;
    grayPx[i + 2] = gray;
    grayPx[i + 3] = a;
  }

  const rawOpts = { raw: { width, height, channels: 4 as const } };

  const [black, white, grayscale] = await Promise.all([
    sharp(blackPx, rawOpts).png().toBuffer(),
    sharp(whitePx, rawOpts).png().toBuffer(),
    sharp(grayPx, rawOpts).png().toBuffer(),
  ]);

  return { black, white, grayscale };
}

/**
 * Convert a base64 data URL to a Buffer.
 */
export function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(base64, "base64");
}

/**
 * Check if an image buffer has any transparent pixels (alpha < 128).
 */
export async function hasTransparency(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) return true;
  }
  return false;
}

/**
 * Extract dominant colors from a logo buffer, ignoring transparent and near-white/black pixels.
 */
export async function extractLogoColors(buffer: Buffer, numColors = 6): Promise<string[]> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(80, 80, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.05 || lum > 0.97) continue;

    const rB = Math.round(r / 24) * 24;
    const gB = Math.round(g / 24) * 24;
    const bB = Math.round(b / 24) * 24;
    const key = `${rB},${gB},${bB}`;
    if (!buckets[key]) buckets[key] = { r: rB, g: gB, b: bB, count: 0 };
    buckets[key].count++;
  }

  const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);
  const selected: string[] = [];

  for (const bucket of sorted) {
    if (selected.length >= numColors) break;
    const hex = toHex(bucket.r, bucket.g, bucket.b);
    const isDup = selected.some((c) => colorDist(c, hex) < 50);
    if (!isDup) selected.push(hex);
  }

  return selected;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

function colorDist(h1: string, h2: string): number {
  const parse = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(h1);
  const [r2, g2, b2] = parse(h2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
