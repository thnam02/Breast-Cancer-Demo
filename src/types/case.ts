export const RECEPTORS = ["ER", "PR", "HER2"] as const;
export type Receptor = (typeof RECEPTORS)[number];

export interface ClinicalRecord {
  age: number;
  sex: string;
  side: string;
  histology: string;
  stage: string;
  tnm: string;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  attn: number;
}

export interface TopTile {
  rank: number;
  img: string;
  attn: number;
}

export interface GeneRecord {
  symbol: string;
  z: number;
  receptor: Receptor;
}

export type CohortName = "TCGA-BRCA" | "CPTAC-BRCA" | "Synthetic";

/** 64-d encoder tokens. Order is clinical, gene, WSI. */
export interface CaseTokens {
  clinical: number[];
  gene: number[];
  wsi: number[];
}

/** Per-tile UNI2-h summary. `norm` is the L2 of the 1536-d vector. `pca` is 3 components. */
export interface TileEmbedding {
  norm: number[];
  pca: number[][];
}

/** Hidden activations captured from the forward pass. Lengths follow the layer, not the patient. */
export interface CaseActivations {
  clin_hidden: number[];
  gene_hidden: number[];
  trunk: number[];
  her2_hidden: number[];
}

/**
 * Replay payload for one case. Every number the demo shows for a patient
 * comes from this file, or from a deterministic seed when an optional block
 * is absent on a synthetic case. `mock` marks a synthetic placeholder; omit
 * it on real exports so the synthetic-data chip stays hidden.
 * Mutual information is cohort-level only and is not stored on a case.
 */
export interface CaseFile {
  caseId: string;
  cohort: CohortName | string;
  /** Neutral picker label. Synthetic cases must not encode IHC here. */
  descriptor?: string;
  mock?: boolean;
  mockNote?: string;
  clinical: ClinicalRecord;
  ihc: Record<Receptor, 0 | 1>;
  pred: Record<Receptor, number>;
  slide: {
    thumb: string;
    width: number;
    height: number;
    dzi: string | null;
  };
  tiles: Tile[];
  topTiles: TopTile[];
  /** Head-averaged 4-head token attention. Rows/columns: clinical, gene, wsi. Not a contribution score. */
  modalityAttention: number[][];
  /** Optional 4×3×3 weights with average_attn_weights left false. Mean across heads equals modalityAttention. */
  modalityAttentionPerHead?: number[][][];
  genes: GeneRecord[];
  tokens?: CaseTokens;
  tileEmbedding?: TileEmbedding;
  activations?: CaseActivations;
}

export function assertCaseFile(data: unknown): CaseFile {
  if (!data || typeof data !== "object") {
    throw new Error("case.json is not an object");
  }
  const row = data as Partial<CaseFile>;
  if (
    typeof row.caseId !== "string" ||
    !row.clinical ||
    !row.ihc ||
    !row.pred ||
    !row.slide ||
    !Array.isArray(row.tiles) ||
    !Array.isArray(row.topTiles) ||
    !Array.isArray(row.modalityAttention) ||
    !Array.isArray(row.genes)
  ) {
    throw new Error("case.json is missing required fields");
  }
  if ("mi" in row) delete (row as { mi?: unknown }).mi;
  return row as CaseFile;
}

export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, "")}`;
}

export function caseAsset(caseId: string, relative: string): string {
  if (relative.startsWith("http://") || relative.startsWith("https://") || relative.startsWith("/")) {
    return relative;
  }
  return publicUrl(`cases/${caseId}/${relative}`);
}
