export function extractColorsFromDataUrl(dataUrl: string, numColors = 5): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 100;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (luminance < 0.08 || luminance > 0.96) continue;

        const rB = Math.round(r / 32) * 32;
        const gB = Math.round(g / 32) * 32;
        const bB = Math.round(b / 32) * 32;
        const key = `${rB},${gB},${bB}`;

        if (!buckets[key]) buckets[key] = { r: rB, g: gB, b: bB, count: 0 };
        buckets[key].count++;
      }

      const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);

      const selected: string[] = [];
      for (const bucket of sorted) {
        if (selected.length >= numColors) break;
        const hex = rgbToHex(bucket.r, bucket.g, bucket.b);
        const isDuplicate = selected.some((c) => colorDistance(c, hex) < 60);
        if (!isDuplicate) selected.push(hex);
      }

      resolve(selected);
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
