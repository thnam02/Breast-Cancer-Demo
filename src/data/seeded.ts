import type { CaseActivations, CaseFile, CaseTokens, TileEmbedding } from "../types/case";

/** Blocks the browser may synthesise when a real export did not include them. */
export type SeedField = "tokens" | "tileEmbedding" | "activations" | "modalityAttentionPerHead";

const seededFields = new WeakMap<CaseFile, ReadonlySet<SeedField>>();

export function isSeeded(caseData: CaseFile, field: SeedField): boolean {
  return seededFields.get(caseData)?.has(field) ?? false;
}

/** Fill missing optional blocks. Real exports are left untouched and are not labelled illustrative. */
export function hydrateCase(input: CaseFile): CaseFile {
  const seeded = new Set<SeedField>();
  const next: CaseFile = { ...input, genes: input.genes.slice(), tiles: input.tiles, modalityAttention: input.modalityAttention };
  const rng = mulberry32(hashString(next.caseId));

  if (!validTokens(next.tokens)) {
    next.tokens = seedTokens(next, rng);
    seeded.add("tokens");
  }
  if (!validEmbedding(next.tileEmbedding, next.tiles.length)) {
    next.tileEmbedding = seedEmbedding(next, rng);
    seeded.add("tileEmbedding");
  }
  if (!validActivations(next.activations)) {
    next.activations = seedActivations(next, rng);
    seeded.add("activations");
  }
  if (!validHeads(next.modalityAttentionPerHead, next.modalityAttention)) {
    next.modalityAttentionPerHead = seedHeads(next.modalityAttention, rng);
    seeded.add("modalityAttentionPerHead");
  }

  seededFields.set(next, seeded);
  return next;
}

function validTokens(tokens: CaseTokens | undefined): tokens is CaseTokens {
  return Boolean(tokens && [tokens.clinical, tokens.gene, tokens.wsi].every((row) => row.length === 64));
}

function validEmbedding(embedding: TileEmbedding | undefined, count: number): embedding is TileEmbedding {
  return Boolean(
    embedding &&
      embedding.norm.length === count &&
      embedding.pca.length === count &&
      embedding.pca.every((row) => row.length === 3),
  );
}

function validActivations(activations: CaseActivations | undefined): activations is CaseActivations {
  return Boolean(
    activations &&
      activations.clin_hidden.length > 0 &&
      activations.gene_hidden.length > 0 &&
      activations.trunk.length > 0 &&
      activations.her2_hidden.length > 0,
  );
}

function validHeads(heads: number[][][] | undefined, mean: number[][]): boolean {
  if (!heads || heads.length !== 4) return false;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let head = 0; head < 4; head += 1) {
        const value = heads[head]?.[row]?.[column];
        if (typeof value !== "number") return false;
        sum += value;
      }
      if (Math.abs(sum / 4 - (mean[row]?.[column] ?? 0)) > 1e-6) return false;
    }
  }
  return true;
}

function seedTokens(caseData: CaseFile, rng: () => number): CaseTokens {
  const gene = new Array<number>(64).fill(0);
  const count = Math.max(1, caseData.genes.length);
  caseData.genes.forEach((item, index) => {
    const center = Math.floor(((index + 0.5) * 64) / count);
    for (let offset = -2; offset <= 2; offset += 1) {
      const slot = (center + offset + 64) % 64;
      gene[slot] += item.z * (1 - Math.abs(offset) / 3);
    }
  });
  for (let index = 0; index < 64; index += 1) gene[index] += gaussian(rng) * 0.12;

  const stage = stageLevel(caseData.clinical.stage);
  const clinical = Array.from({ length: 64 }, (_, index) => stage * (0.75 + (index % 7) * 0.02) + gaussian(rng) * 0.05);

  const ranked = [...caseData.tiles].sort((a, b) => b.attn - a.attn).slice(0, 6);
  const topMean = ranked.reduce((sum, tile) => sum + tile.attn, 0) / Math.max(1, ranked.length);
  const wsi = Array.from({ length: 64 }, () => topMean * 48 + gaussian(rng) * topMean * 6);

  return { clinical, gene, wsi };
}

function seedEmbedding(caseData: CaseFile, rng: () => number): TileEmbedding {
  const attention = caseData.tiles.map((tile) => tile.attn);
  const mixed = correlate(attention, rng, 0.6);
  const floor = Math.min(...mixed);
  const norm = mixed.map((value) => 18 + (value - floor) * 6);
  const pca = caseData.tiles.map((tile, index) => [
    mixed[index],
    tile.x / caseData.slide.width - 0.5 + gaussian(rng) * 0.08,
    tile.y / caseData.slide.height - 0.5 + gaussian(rng) * 0.08,
  ]);
  return { norm, pca };
}

function seedActivations(caseData: CaseFile, rng: () => number): CaseActivations {
  const drive = (caseData.pred.ER + caseData.pred.PR + caseData.pred.HER2) / 3;
  const series = (length: number, gain: number) =>
    Array.from({ length }, () => Math.max(0, gain * drive + Math.abs(gaussian(rng)) * 0.35));
  return {
    clin_hidden: series(32, 0.8),
    gene_hidden: series(48, 1),
    trunk: series(224, 1.1),
    her2_hidden: series(16, 0.9 + caseData.pred.HER2),
  };
}

/** Four noisy heads whose cell-wise mean is exactly the stored head-average. */
function seedHeads(mean: number[][], rng: () => number): number[][][] {
  const heads = [0, 1, 2, 3].map(() =>
    [0, 1, 2].map((row) => [0, 1, 2].map((column) => mean[row]?.[column] ?? 0)),
  );
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const noise = [0, 1, 2, 3].map(() => rng() - 0.5);
      const shift = noise.reduce((sum, value) => sum + value, 0) / noise.length;
      noise.forEach((value, head) => {
        heads[head][row][column] = (mean[row]?.[column] ?? 0) + (value - shift) * 0.12;
      });
    }
  }
  return heads;
}

function correlate(signal: number[], rng: () => number, target: number): number[] {
  const mean = signal.reduce((sum, value) => sum + value, 0) / Math.max(1, signal.length);
  const variance = signal.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, signal.length);
  const scale = Math.sqrt(variance) || 1;
  const noise = Math.sqrt(Math.max(0, 1 - target * target));
  return signal.map((value) => (target * (value - mean)) / scale + noise * gaussian(rng));
}

function stageLevel(stage: string): number {
  const text = stage.toUpperCase();
  if (text.startsWith("IV") || text.startsWith("4")) return 1;
  if (text.startsWith("III") || text.startsWith("3")) return 0.75;
  if (text.startsWith("II") || text.startsWith("2")) return 0.5;
  return 0.25;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
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

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}
