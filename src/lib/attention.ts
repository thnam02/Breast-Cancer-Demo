import type { Tile } from "../types/case";

export interface AttentionStats {
  top100: number;
  entropy: number;
  total: number;
  ranked: number[];
}

/** Top-100 mass and Shannon entropy (nats) from the tile weights in the case file. */
export function attentionStats(tiles: Tile[]): AttentionStats {
  const weights = tiles.map((tile) => Math.max(0, tile.attn));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const ranked = weights
    .map((attn, index) => ({ index, attn }))
    .sort((a, b) => b.attn - a.attn || a.index - b.index)
    .map((row) => row.index);

  if (total <= 0) {
    return { top100: 0, entropy: 0, total: 0, ranked };
  }

  const probs = weights.map((weight) => weight / total);
  const entropy = -probs.reduce((sum, prob) => (prob > 0 ? sum + prob * Math.log(prob) : sum), 0);
  const top100 = ranked
    .slice(0, Math.min(100, ranked.length))
    .reduce((sum, index) => sum + probs[index], 0);

  return { top100, entropy, total, ranked };
}

export function shareOfAttention(attn: number, total: number): number {
  if (total <= 0) return 0;
  return (Math.max(0, attn) / total) * 100;
}
