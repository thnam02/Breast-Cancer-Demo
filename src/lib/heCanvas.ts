import type { CaseFile } from "../types/case";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural H&E thumbnail. Purple tumour mass follows the tile weights in the case file. */
export function paintSyntheticSlide(ctx: CanvasRenderingContext2D, caseData: CaseFile): void {
  const { width: logicalW, height: logicalH } = caseData.slide;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const scaleX = width / logicalW;
  const scaleY = height / logicalH;
  const rng = mulberry32(hashString(caseData.caseId));
  const grain = mulberry32(hashString(`${caseData.caseId}:grain`));
  const tiles = caseData.tiles;
  const maxAttn = Math.max(...tiles.map((tile) => tile.attn), 1e-12);

  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const ly = y / scaleY;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const n = grain();
      const lx = x / scaleX;
      const speckle = (Math.sin(lx * 0.37) + Math.sin(ly * 0.29)) * 1.5;
      data[i] = 188 + n * 16 + speckle;
      data[i + 1] = 136 + n * 12 + speckle * 0.4;
      data[i + 2] = 146 + n * 10;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < logicalW * logicalH; i += 1) rng();

  const kind = growthKind(caseData);
  for (const tile of tiles) {
    const intensity = tile.attn / maxAttn;
    if (intensity < 0.08) continue;
    paintGrowth(ctx, tile, intensity, scaleX, scaleY, rng, kind);
  }
}

type GrowthKind = "lobular" | "ductal" | "triple-negative";

function growthKind(caseData: CaseFile): GrowthKind {
  const triple = caseData.ihc.ER === 0 && caseData.ihc.PR === 0 && caseData.ihc.HER2 === 0;
  if (triple) return "triple-negative";
  if (caseData.clinical.histology.toLowerCase().includes("lobular")) return "lobular";
  return "ductal";
}

function paintGrowth(
  ctx: CanvasRenderingContext2D,
  tile: CaseFile["tiles"][number],
  intensity: number,
  scaleX: number,
  scaleY: number,
  rng: () => number,
  kind: GrowthKind,
) {
  const originX = tile.x * scaleX;
  const originY = tile.y * scaleY;
  const width = tile.w * scaleX;
  const height = tile.h * scaleY;
  if (kind === "lobular") {
    const count = 5 + Math.floor(intensity * 7);
    const angle = rng() * Math.PI;
    const along = Math.cos(angle);
    const across = Math.sin(angle);
    for (let index = 0; index < count; index += 1) {
      const t = (index + 0.5) / count;
      const gap = (rng() - 0.5) * width * 0.04;
      const x = originX + width * 0.5 + (t - 0.5) * width * 0.82 * along + gap * across;
      const y = originY + height * 0.5 + (t - 0.5) * height * 0.82 * across + gap * along;
      nucleus(ctx, x, y, (0.55 + rng() * 0.35) * scaleX, (0.45 + rng() * 0.3) * scaleY, rng() * Math.PI, "rgba(72, 28, 88, 0.9)");
    }
    return;
  }
  const nest = kind === "triple-negative" ? 16 + Math.floor(intensity * 18) : 7 + Math.floor(intensity * 8);
  const radius = (kind === "triple-negative" ? 0.34 : 0.28) * Math.min(width, height);
  for (let index = 0; index < nest; index += 1) {
    const spread = kind === "ductal" ? Math.sqrt(rng()) * radius : rng() * radius;
    const angle = rng() * Math.PI * 2;
    const x = originX + width * 0.5 + Math.cos(angle) * spread;
    const y = originY + height * 0.5 + Math.sin(angle) * spread;
    const pleomorphic = kind === "triple-negative";
    const rx = (pleomorphic ? 0.45 + rng() * 1.5 : 0.6 + rng() * 0.55) * scaleX;
    const ry = (pleomorphic ? 0.35 + rng() * 1.2 : 0.5 + rng() * 0.4) * scaleY;
    nucleus(ctx, x, y, rx, ry, rng() * Math.PI, intensity > 0.35 ? "rgba(42, 16, 58, 0.92)" : "rgba(110, 58, 78, 0.7)");
  }
}

export function slideBitmap(caseData: CaseFile): HTMLCanvasElement {
  const cached = bitmapCache.get(caseData.caseId);
  if (cached) return cached;
  const scale = Math.max(1, 2048 / caseData.slide.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(caseData.slide.width * scale);
  canvas.height = Math.round(caseData.slide.height * scale);
  const context = canvas.getContext("2d");
  if (context) paintSyntheticSlide(context, caseData);
  bitmapCache.set(caseData.caseId, canvas);
  return canvas;
}

const bitmapCache = new Map<string, HTMLCanvasElement>();

function nucleus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation: number,
  color: string,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.4, rx), Math.max(0.35, ry), rotation, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
