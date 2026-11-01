import type { CaseFile, Tile } from "../types/case";

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

function attnAt(tiles: Tile[], x: number, y: number): number {
  for (const tile of tiles) {
    if (x >= tile.x && x < tile.x + tile.w && y >= tile.y && y < tile.y + tile.h) {
      return tile.attn;
    }
  }
  return 0;
}

/** Procedural H&E thumbnail. Purple tumour mass follows the tile weights in the case file. */
export function paintSyntheticSlide(ctx: CanvasRenderingContext2D, caseData: CaseFile): void {
  const { width, height } = caseData.slide;
  const rng = mulberry32(hashString(caseData.caseId));
  const tiles = caseData.tiles;
  const maxAttn = Math.max(...tiles.map((tile) => tile.attn), 1e-12);

  ctx.clearRect(0, 0, width, height);
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#e7b3c0");
  base.addColorStop(0.5, "#d89aab");
  base.addColorStop(1, "#e4b7c4");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 16; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 70 + rng() * 240;
    const wash = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    wash.addColorStop(0, rng() > 0.45 ? "rgba(246, 206, 214, 0.7)" : "rgba(176, 96, 118, 0.28)");
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#f6d5dc";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 28; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + 40 + rng() * 90,
      y - 30 + rng() * 40,
      x + rng() * 80,
      y + 50 + rng() * 70,
      x + 80 + rng() * 80,
      y + 10,
    );
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 110; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    if (attnAt(tiles, x, y) / maxAttn > 0.2) continue;
    const rx = 8 + rng() * 26;
    const ry = 6 + rng() * 18;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 252, 249, 0.94)";
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = "rgba(206, 142, 158, 0.95)";
    ctx.stroke();
  }

  for (const tile of tiles) {
    const intensity = tile.attn / maxAttn;
    if (intensity < 0.08) continue;
    const cx = tile.x + tile.w * (0.35 + rng() * 0.3);
    const cy = tile.y + tile.h * (0.35 + rng() * 0.3);
    const radius = tile.w * (0.55 + intensity * 0.45);
    const wash = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius);
    wash.addColorStop(0, `rgba(74, 28, 112, ${0.15 + intensity * 0.72})`);
    wash.addColorStop(0.62, `rgba(112, 52, 132, ${0.05 + intensity * 0.28})`);
    wash.addColorStop(1, "rgba(112, 52, 132, 0)");
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const tile of tiles) {
    const intensity = tile.attn / maxAttn;
    const nuclei = intensity > 0.16 ? 8 + Math.floor(intensity * 22) : 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nuclei; i += 1) {
      const x = tile.x + rng() * tile.w;
      const y = tile.y + rng() * tile.h;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.8 + rng() * 1.3, 0.6 + rng() * 0.9, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = intensity > 0.18 ? "rgba(36, 12, 58, 0.82)" : "rgba(128, 72, 96, 0.4)";
      ctx.fill();
    }
  }
}
